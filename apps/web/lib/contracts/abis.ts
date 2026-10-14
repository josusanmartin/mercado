// Generated ABIs from @mercado/shared (packages/contracts/script/export.mjs), under the names the app uses.
import {
  investDeskAbi,
  mercadoCardAbi,
  moveAmmAbi,
  multiCollateralVaultAbi,
  priceFeedAbi,
  stakedOusdAbi,
  collateralVaultAbi,
  creditPoolAbi as poolAbi,
  fxOracleAdapterAbi,
  localStableFactoryAbi,
  swapDeskAbi as deskAbi,
  tip20Abi,
} from "@mercado/shared";

/** Tempo TIP-20 precompile interface (ERC-20 + transferWithMemo, roles, …). Works for OUSD and xMXN. */
export const tokenAbi = tip20Abi;
export const oracleAbi = fxOracleAdapterAbi;
export const vaultAbi = collateralVaultAbi;
export const swapDeskAbi = deskAbi;
export const creditPoolAbi = poolAbi;
export const factoryAbi = localStableFactoryAbi;

/** Every custom error the protocol can surface, so nested reverts (e.g. the oracle inside the vault) decode. */
export const allErrorsAbi = [
  ...tip20Abi,
  ...fxOracleAdapterAbi,
  ...collateralVaultAbi,
  ...deskAbi,
  ...poolAbi,
  ...multiCollateralVaultAbi,
  ...moveAmmAbi,
  ...mercadoCardAbi,
  ...investDeskAbi,
  ...priceFeedAbi,
  ...stakedOusdAbi,
].filter((x) => x.type === "error");
