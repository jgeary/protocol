/*
 * @file General actions taken by users and funds in the lifespan of a fund
 *
 * @test A user can only invest in a fund if they are whitelisted and have set a token allowance for the fund
 * @test A fund can take an order (on OasisDex)
 * @test A user cannot invest in a fund that has been shutdown
 * @test TODO: Calculate fees?
 * @test TODO: Redeem shares?
 */

import { encodeFunctionSignature } from 'web3-eth-abi';
import { BN, toWei } from 'web3-utils';
import { deploy, call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { BNExpDiv } from '~/tests/utils/BNmath';
import getAccounts from '~/deploy/utils/getAccounts';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { stringToBytes } from '~/tests/utils/formatting';
import { investInFund, getFundComponents } from '~/tests/utils/fund';
import { getEventFromLogs, getFunctionSignature } from '~/tests/utils/metadata';
import { encodeOasisDexTakeOrderArgs } from '~/tests/utils/oasisDex';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts, investorTxOpts;
let contracts;
let exchangeIndex;
let offeredValue, wantedShares, amguAmount;
let mln, weth, fundFactory, oasisDex, oasisDexAdapter, priceSource;
let takeOrderFunctionSig;
let priceTolerance, sharesRequestor, userWhitelist;
let managementFee, performanceFee;
let fund;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  const deployed = await partialRedeploy(CONTRACT_NAMES.FUND_FACTORY);
  contracts = deployed.contracts;

  userWhitelist = await deploy(CONTRACT_NAMES.USER_WHITELIST, [[]]);

  mln = contracts.MLN;
  weth = contracts.WETH;
  fundFactory = contracts.FundFactory;
  oasisDex = contracts.OasisDexExchange;
  oasisDexAdapter = contracts.OasisDexAdapter;
  priceSource = contracts.TestingPriceFeed;
  priceTolerance = contracts.PriceTolerance;
  managementFee = contracts.ManagementFee;
  performanceFee = contracts.PerformanceFee;
  sharesRequestor = contracts.SharesRequestor;

  const targetInvestorWeth = new BN(toWei('10', 'ether'));
  const currentInvestorWeth = new BN(await call(weth, 'balanceOf', [investor]));
  const wethToSend = targetInvestorWeth.sub(currentInvestorWeth);
  if (wethToSend.gt(new BN(0))) {
    await send(weth, 'transfer', [investor, wethToSend.toString()], defaultTxOpts);
  }
  await send(mln, 'transfer', [investor, toWei('10', 'ether')], defaultTxOpts);

  await send(priceSource, 'update', [
    [weth.options.address, mln.options.address],
    [toWei('1', 'ether'), toWei('0.5', 'ether')],
  ], defaultTxOpts);

  const fees = {
    contracts: [
      managementFee.options.address,
      performanceFee.options.address
    ],
    rates: [toWei('0.02', 'ether'), toWei('0.2', 'ether')],
    periods: [0, 7776000], // 0 and 90 days
  };
  const fundName = stringToBytes(`Test fund ${Date.now()}`, 32);
  await send(fundFactory, 'beginSetup', [
    fundName,
    fees.contracts,
    fees.rates,
    fees.periods,
    [oasisDex.options.address],
    [oasisDexAdapter.options.address],
    weth.options.address,
    [weth.options.address, mln.options.address],
  ], managerTxOpts);
  await send(fundFactory, 'createFeeManager', [], managerTxOpts);
  await send(fundFactory, 'createPolicyManager', [], managerTxOpts);
  await send(fundFactory, 'createShares', [], managerTxOpts);
  await send(fundFactory, 'createVault', [], managerTxOpts);
  const res = await send(fundFactory, 'completeSetup', [], managerTxOpts);
  const hubAddress = getEventFromLogs(res.logs, CONTRACT_NAMES.FUND_FACTORY, 'NewFund').hub;

  fund = await getFundComponents(hubAddress);

  offeredValue = toWei('1', 'ether');
  const shareCost = new BN(
    await call(
      fund.shares,
      'getSharesCostInAsset',
      [toWei('1', 'ether'), weth.options.address]
    )
  );
  wantedShares = BNExpDiv(new BN(offeredValue), shareCost).toString();
  amguAmount = toWei('0.1', 'ether');

  exchangeIndex = 0;

  takeOrderFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );
  await send(fund.policyManager, 'register', [
    encodeFunctionSignature(takeOrderFunctionSig),
    priceTolerance.options.address,
  ], managerTxOpts);

  const buySharesFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.SHARES,
    'buyShares',
  );
  await send(fund.policyManager, 'register', [
    encodeFunctionSignature(buySharesFunctionSig),
    userWhitelist.options.address,
  ], managerTxOpts);
});

test('Request shares fails for whitelisted user with no allowance', async () => {
  const { hub } = fund;

  await expect(
    send(
      sharesRequestor,
      'requestShares',
      [hub.options.address, weth.options.address, offeredValue, wantedShares],
      { ...defaultTxOpts, value: amguAmount }
    )
  ).rejects.toThrowFlexible();
});

test('Buying shares (initial investment) fails for user not on whitelist', async () => {
  const { hub } = fund;

  await send(weth, 'transfer', [investor, offeredValue], defaultTxOpts);
  await send(
    weth,
    'approve',
    [sharesRequestor.options.address, offeredValue],
    investorTxOpts
  );
  await expect(
    send(
      sharesRequestor,
      'requestShares',
      [hub.options.address, weth.options.address, offeredValue, wantedShares],
      { ...investorTxOpts, value: amguAmount }
    )
  ).rejects.toThrowFlexible("Rule evaluated to false: UserWhitelist");
});

test('Buying shares (initial investment) succeeds for whitelisted user with allowance', async () => {
  const { hub, shares } = fund;

  await send(userWhitelist, 'addToWhitelist', [investor], defaultTxOpts);

  await send(
    sharesRequestor,
    'requestShares',
    [hub.options.address, weth.options.address, offeredValue, wantedShares],
    { ...investorTxOpts, value: amguAmount }
  );

  const investorShares = await call(shares, 'balanceOf', [investor]);

  expect(investorShares.toString()).toEqual(wantedShares.toString());
});

test('Fund can take an order on Oasis DEX', async () => {
  const { vault } = fund;

  const makerQuantity = toWei('2', 'ether');
  const makerAsset = mln.options.address;
  const takerQuantity = toWei('0.1', 'ether');
  const takerAsset = weth.options.address;

  await send(mln, 'approve', [oasisDex.options.address, makerQuantity], defaultTxOpts);
  const res = await send(oasisDex, 'offer', [
    makerQuantity, makerAsset, takerQuantity, takerAsset, 0
  ], defaultTxOpts);

  const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
  const orderId = logMake.id;

  const preMlnFundHoldings = await call(vault, 'assetBalances', [mln.options.address]);
  const preWethFundHoldings = await call(vault, 'assetBalances', [weth.options.address]);

  const encodedArgs = encodeOasisDexTakeOrderArgs({
    makerAsset,
    makerQuantity,
    takerAsset,
    takerQuantity,
    orderId,
  });

  await send(
    vault,
    'callOnExchange',
    [
      exchangeIndex,
      takeOrderFunctionSig,
      encodedArgs,
    ],
    managerTxOpts,
  );

  const postMlnFundHoldings = await call(vault, 'assetBalances', [mln.options.address]);
  const postWethFundHoldings = await call(vault, 'assetBalances', [weth.options.address]);

  expect(
    new BN(postMlnFundHoldings.toString()).eq(
      new BN(preMlnFundHoldings.toString()).add(new BN(makerQuantity.toString())),
    ),
  ).toBe(true);
  expect(
    new BN(postWethFundHoldings.toString()).eq(
      new BN(preWethFundHoldings.toString()).sub(new BN(takerQuantity.toString())),
    ),
  ).toBe(true);
});

// TODO - redeem shares?

// TODO - calculate fees?

test('Cannot invest in a shutdown fund', async () => {
  const { hub } = fund;

  await send(fundFactory, 'shutDownFund', [hub.options.address], managerTxOpts);
  await expect(
    investInFund({
      fundAddress: hub.options.address,
      investment: {
        contribAmount: offeredValue,
        investor,
        isInitial: true,
        tokenContract: weth
      }
    })
  ).rejects.toThrowFlexible("Fund is not active");
});
