// A readable message from a Clerk error (they carry a list of errors with a plain-language long message).
export const clerkMessage = (e, fallback = 'That did not work. Please try again.') =>
  e?.errors?.[0]?.longMessage || e?.errors?.[0]?.message || e?.message || fallback;
