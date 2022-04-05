import { YAMLHandler } from '.';
import YAMLContext from '..';

type ParsedGuardianFactors = {
  guardianFactors: unknown[];
};

async function parseAndDump(context: YAMLContext): Promise<ParsedGuardianFactors> {
  // nothing to do, set default if empty
  return {
    guardianFactors: [...(context.assets.guardianFactors || [])],
  };
}

const guardianFactorsHandler: YAMLHandler<ParsedGuardianFactors> = {
  parse: parseAndDump,
  dump: parseAndDump,
};

export default guardianFactorsHandler;
