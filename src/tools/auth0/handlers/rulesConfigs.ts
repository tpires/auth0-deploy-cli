import { Assets, Asset, CalculatedChanges } from '../../../types';
import DefaultHandler from './default';

export const schema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      key: { type: 'string', pattern: '^[A-Za-z0-9_-]*$' },
      value: { type: 'string' },
    },
    required: ['key', 'value'],
  },
  additionalProperties: false,
};

export default class RulesConfigsHandler extends DefaultHandler {
  constructor(options: DefaultHandler) {
    super({
      ...options,
      type: 'rulesConfigs',
      id: 'key',
      functions: {
        update: 'set', // Update or Creation of a ruleConfig is via set not update
      },
    });
  }

  async getType(): Promise<Asset[]> {
    return this.client.rulesConfigs.getAll();
  }

  objString(item): string {
    return super.objString({ key: item.key });
  }

  async calcChanges(assets: Assets): Promise<CalculatedChanges> {
    const { rulesConfigs } = assets;

    // Do nothing if not set
    if (!rulesConfigs || !rulesConfigs.length)
      return {
        del: [],
        update: [],
        create: [],
        conflicts: [],
      };

    // Intention is to not delete/cleanup old configRules, that needs to be handled manually.
    return {
      del: [],
      update: rulesConfigs,
      create: [],
      conflicts: [],
    };
  }
}
