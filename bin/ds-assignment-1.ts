#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DsAssignment1Stack } from '../lib/ds-assignment-1-stack';

const app = new cdk.App();
new DsAssignment1Stack(app, 'DsAssignment1Stack', { env: { region: "eu-west-1" } });