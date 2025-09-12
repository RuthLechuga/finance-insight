#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FinanceInsightStack } from '../lib/finance-insight-stack';

const app = new cdk.App();
new FinanceInsightStack(app, 'FinanceInsightStack');
