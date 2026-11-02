"use strict";Object.defineProperty(exports,"__esModule",{value:!0});
// Test fixture, not a product plugin: opens the first N non-archived root sessions as sidebar tabs (N = window.__seedTabs, default 300),
// so the sidebar has the rows of a heavy user. It is part of every config including bare, so it is the floor, not a cost.
const g=require("@opencode/plugin/gui");
exports.default=g.Plugin.define({setup(ctx){
  const run=async()=>{
    if(window.__seedTabsDone)return;window.__seedTabsDone=1;
    const want=Number(window.__seedTabs||0);let n=0;
    for(const id of ctx.servers.list()){const s=ctx.servers.get(id);if(!s||!s.connected)continue;
      let cursor;do{const page=await s.client.session.list({archived:false,parentID:null,limit:100,cursor});
        for(const x of page.data){if(n>=want)break;ctx.tabs.open({server:id,id:x.id},{focus:false});n++}
        cursor=n<want?page.cursor?.next:undefined}while(cursor)}
    window.__seedTabsOpened=n};
  setTimeout(()=>run().catch(e=>{window.__seedTabsError=String(e)}),3000)}});
