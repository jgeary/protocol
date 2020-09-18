import { BigNumberish, utils } from 'ethers';
import { AddressLike, Contract, Send } from '@crestproject/crestproject';
import { FundComponents } from './setup';
import * as contracts from '../../contracts';

// prettier-ignore
export interface DenominationAssetInterface extends Contract {
  approve: Send<(spender: AddressLike, amount: BigNumberish) => boolean, DenominationAssetInterface>;
}

export interface RequestSharesParams {
  denominationAsset: DenominationAssetInterface;
  fundComponents: FundComponents;
  sharesRequestor: contracts.SharesRequestor;
  amguValue?: BigNumberish;
  investmentAmount?: BigNumberish;
  sharesAmount?: BigNumberish;
}

export async function requestShares({
  denominationAsset,
  fundComponents,
  sharesRequestor,
  amguValue = utils.parseEther('1'),
  investmentAmount = utils.parseEther('1'),
  sharesAmount = investmentAmount,
}: RequestSharesParams) {
  await denominationAsset.approve(sharesRequestor, investmentAmount);

  return sharesRequestor.requestShares
    .args(fundComponents.hub, investmentAmount, sharesAmount)
    .value(amguValue)
    .send();
}