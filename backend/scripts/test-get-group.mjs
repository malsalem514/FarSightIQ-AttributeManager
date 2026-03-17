#!/usr/bin/env node
import * as groupsService from '../src/services/groups.service.js';

async function test() {
  const group = await groupsService.getGroup(65, 'APPAREL_GROUP');
  console.log('Group details:');
  console.log(group);
}

test();

