import test from "ava";
import Api from "@parity/api";
import { participation as compliance } from "../../../utils/lib/utils.js";

const addressBook = require("../../../addressBook.json");
const BigNumber = require("bignumber.js");
const environmentConfig = require("../../../utils/config/environment.js");
const fs = require("fs");

const environment = "development";
const config = environmentConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

// hoisted variables
let accounts;
let deployer;
let investor;
let opts;

const addresses = addressBook[environment];

test.before(async t => {
  accounts = await api.eth.accounts();
  deployer = accounts[0];
  investor = accounts[1];
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
});

test("Anyone can perform subscription", async t => {
  const isSubscriptionPermitted = await compliance.instance.isSubscriptionPermitted.call(
    {},
    [investor, 100, 100],
  );
  t.truthy(isSubscriptionPermitted);
});

test("Anyone can perform redemption", async t => {
  const isRedemptionPermitted = await compliance.instance.isRedemptionPermitted.call(
    {},
    [investor, 100, 100],
  );
  t.truthy(isRedemptionPermitted);
});