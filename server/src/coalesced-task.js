// Keep one running refresh and one invalidation, rather than serializing every
// presence request into an ever-growing backlog. No authorization is cached.
export function createCoalescedTask(work) {
  let active=null, dirty=false;
  return () => {
    dirty=true;
    if(!active)active=Promise.resolve().then(async()=>{
      try {while(dirty){dirty=false;await work();}}
      finally {active=null;}
    });
    return active;
  };
}
