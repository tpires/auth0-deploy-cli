import DefaultHandler from './default';
import constants from '../../constants';
import { Asset, Assets, CalculatedChanges } from '../../../types';

const ALLOWED_TRIGGER_IDS = [
  'credentials-exchange',
  'pre-user-registration',
  'post-user-registration',
  'post-change-password',
  'send-phone-message',
];

export const excludeSchema = {
  type: 'array',
  items: { type: 'string' },
};

export const schema = {
  type: 'array',
  items: {
    type: 'object',
    default: [],
    properties: {
      script: {
        type: 'string',
        description: "A script that contains the hook's code",
        default: '',
      },
      name: {
        type: 'string',
        description:
          "The name of the hook. Can only contain alphanumeric characters, spaces and '-'. Can neither start nor end with '-' or spaces",
        pattern: '^[^-\\s][a-zA-Z0-9-\\s]+[^-\\s]$',
      },
      enabled: {
        type: 'boolean',
        description: 'true if the hook is active, false otherwise',
        default: false,
      },
      triggerId: {
        type: 'string',
        description: "The hooks's trigger ID",
        enum: ALLOWED_TRIGGER_IDS,
      },
      secrets: {
        type: 'object',
        description: 'List of key-value pairs containing secrets available to the hook.',
        default: {},
      },
      dependencies: {
        type: 'object',
        default: {},
        description: 'List of key-value pairs of NPM dependencies available to the hook.',
      },
    },
    required: ['script', 'name', 'triggerId'],
  },
};

const getCertainHook = (hooks: Asset[], name: string, triggerId: string): Asset | null => {
  let result: Asset | null = null;

  hooks.forEach((hook) => {
    if (hook.name === name && hook.triggerId === triggerId) {
      result = hook;
    }
  });

  return result;
};

const getActive = (hooks) => {
  const result = {};

  ALLOWED_TRIGGER_IDS.forEach((type) => {
    result[type] = hooks.filter((h) => h.active && h.triggerId === type);
  });

  return result;
};

export default class HooksHandler extends DefaultHandler {
  existing: Asset[];

  constructor(options: DefaultHandler) {
    super({
      ...options,
      type: 'hooks',
      stripUpdateFields: ['id', 'triggerId'],
    });
  }

  objString(hook): string {
    return super.objString({ name: hook.name, triggerId: hook.triggerId });
  }

  async processSecrets(hooks): Promise<void> {
    const allHooks = await this.getType(true);
    const changes: CalculatedChanges = {
      create: [],
      update: [],
      del: [],
      conflicts: [],
    };

    hooks.forEach((hook) => {
      const current = getCertainHook(allHooks, hook.name, hook.triggerId);
      if (current) {
        // if the hook was deleted we don't care about its secrets
        const oldSecrets = current.secrets || {};
        const newSecrets = hook.secrets || {};
        const create = {};
        const update = {};
        const del: string[] = [];

        Object.keys(newSecrets).forEach((key) => {
          if (!oldSecrets[key]) {
            create[key] = newSecrets[key];
          } else if (newSecrets[key] !== constants.HOOKS_HIDDEN_SECRET_VALUE) {
            update[key] = newSecrets[key];
          }
        });

        Object.keys(oldSecrets).forEach((key) => {
          if (!newSecrets[key]) {
            del.push(key);
          }
        });

        if (Object.keys(create).length)
          changes.create.push({ hookId: current.id, secrets: create });
        if (Object.keys(update).length)
          changes.update.push({ hookId: current.id, secrets: update });
        if (del.length) changes.del.push({ hookId: current.id, secrets: del });
      }
    });

    await Promise.all(
      changes.del.map(async (data) => {
        await this.client.hooks.removeSecrets({ id: data.hookId }, data.secrets);
      })
    );

    await Promise.all(
      changes.update.map(async (data) => {
        await this.client.hooks.updateSecrets({ id: data.hookId }, data.secrets);
      })
    );

    await Promise.all(
      changes.create.map(async (data) => {
        await this.client.hooks.addSecrets({ id: data.hookId }, data.secrets);
      })
    );
  }

  //@ts-ignore because hooks use a special reload argument
  async getType(reload: boolean): Promise<Asset[]> {
    if (this.existing && !reload) {
      return this.existing;
    }

    // in case client version does not support hooks
    if (!this.client.hooks || typeof this.client.hooks.getAll !== 'function') {
      return [];
    }

    try {
      const hooks = await this.client.hooks.getAll({ paginate: true, include_totals: true });

      // hooks.getAll does not return code and secrets, we have to fetch hooks one-by-one
      this.existing = await Promise.all(
        hooks.map((hook: { id: string }) =>
          this.client.hooks
            .get({ id: hook.id })
            .then((hookWithCode) =>
              this.client.hooks
                .getSecrets({ id: hook.id })
                .then((secrets) => ({ ...hookWithCode, secrets }))
            )
        )
      );

      return this.existing;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 501) {
        return [];
      }
      throw err;
    }
  }

  async calcChanges(assets: Assets): Promise<CalculatedChanges> {
    const { del, update, create, conflicts } = await super.calcChanges(assets);

    // strip secrets before hooks creating/updating, secrets have to be handled separately
    const stripSecrets = (list) => list.map((item) => ({ ...item, secrets: undefined }));

    return {
      del,
      update: stripSecrets(update),
      create: stripSecrets(create),
      conflicts: stripSecrets(conflicts),
    };
  }

  async validate(assets): Promise<void> {
    const { hooks } = assets;

    // Do nothing if not set
    if (!hooks) return;

    const activeHooks = getActive(hooks);

    ALLOWED_TRIGGER_IDS.forEach((type) => {
      if (activeHooks[type].length > 1) {
        // There can be only one!
        const conflict = activeHooks[type].map((h) => h.name).join(', ');
        const err = new Error(
          `Only one active hook allowed for "${type}" extensibility point. Conflicting hooks: ${conflict}`
        );
        //@ts-ignore need to investigate if appending status actually works here
        err.status = 409;
        throw err;
      }
    });

    await super.validate(assets);
  }

  async processChanges(assets: Assets): Promise<void> {
    const { hooks } = assets;

    // Do nothing if not set
    if (!hooks) return;

    // Figure out what needs to be updated vs created
    const changes = await this.calcChanges(assets);
    await super.processChanges(assets, {
      del: changes.del,
      create: changes.create,
      update: changes.update,
      conflicts: changes.conflicts,
    });

    await this.processSecrets(hooks);
  }
}
