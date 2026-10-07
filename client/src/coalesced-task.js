// Freshness without an unbounded promise backlog: invalidations received while
// a refresh is in flight request one more pass using the latest server state.
export function createCoalescedTask(work) {
  let active=null, dirty=false, disposed=false;
  const run=()=>{
    if(disposed)return Promise.resolve();dirty=true;
    if(!active)active=Promise.resolve().then(async()=>{
      try {while(dirty && !disposed){dirty=false;await work();}}
      finally {active=null;}
    });
    return active;
  };
  run.dispose=()=>{disposed=true;dirty=false;};
  return run;
}
