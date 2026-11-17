// What belongs to the Personal workspace. An item lives in exactly one workspace at a time: a lead
// (or contact, or note) moved to Team has left Personal until it is moved back. Applied jobs,
// interviews, offers and rejections are always personal; only open leads can be shared.
export const isPersonalJob = (job) => job.status !== 'lead' || (job.visibility || 'personal') === 'personal';
export const personalJobs = (jobs) => jobs.filter(isPersonalJob);
