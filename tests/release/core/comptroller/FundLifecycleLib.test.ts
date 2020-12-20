import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { defaultTestDeployment } from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(provider);

  return {
    accounts,
    deployment,
    config,
  };
}

describe('constructor', () => {
  it('sets initial state for library', async () => {
    const {
      deployment: { chainlinkPriceFeed, feeManager, fundDeployer, fundLifecycleLib, integrationManager, policyManager },
    } = await provider.snapshot(snapshot);

    const routesCall = await fundLifecycleLib.getLibRoutes();
    expect(routesCall).toMatchFunctionOutput(fundLifecycleLib.getLibRoutes, {
      feeManager_: feeManager,
      fundDeployer_: fundDeployer,
      integrationManager_: integrationManager,
      policyManager_: policyManager,
      primitivePriceFeed_: chainlinkPriceFeed,
    });
  });
});
