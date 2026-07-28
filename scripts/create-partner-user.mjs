// Admin-only account provisioning for government/NGO users.
//
// There is no public sign-up screen anywhere in this project -- accounts
// are created here, by whoever administers the platform, using the same
// SUPABASE_SERVICE_KEY the backend servers already use. This is what lets
// org_type be trusted: a client app can read its own org_type (see the
// profiles_select_own RLS policy in supabase/003_recreate_profiles_org_type.sql)
// but can never set or change it.
//
// Usage:
//   node --env-file=.env scripts/create-partner-user.mjs \
//     --email tracey@edupartners.co.za --password '...' \
//     --org-type ngo --name "Tracey Adams"
//
//   node --env-file=.env scripts/create-partner-user.mjs \
//     --existing-user-id <uuid> --org-type government --name "..."

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY are not set -- see .env.example');
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      args[key] = value;
    }
  }
  return args;
}

function headers() {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function createAuthUser(email, password) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await resp.json();
  if (!resp.ok) throw new Error(`auth user creation failed (${resp.status}): ${JSON.stringify(body)}`);
  return body.id;
}

async function deleteAuthUser(userId) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: headers(),
  }).catch(() => {});
}

async function upsertProfile(userId, orgType, fullName) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
    method: 'POST',
    headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: userId, org_type: orgType, full_name: fullName || null }),
  });
  if (!resp.ok) throw new Error(`profile upsert failed (${resp.status}): ${await resp.text()}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args['org-type'] || !['government', 'ngo'].includes(args['org-type'])) {
    console.error('Usage: --org-type government|ngo is required');
    process.exit(1);
  }

  let userId = args['existing-user-id'];

  if (!userId) {
    if (!args.email || !args.password) {
      console.error('Usage: either --existing-user-id <uuid>, or both --email and --password, are required');
      process.exit(1);
    }
    userId = await createAuthUser(args.email, args.password);
    console.log(`created auth user ${args.email} -> ${userId}`);
  }

  try {
    await upsertProfile(userId, args['org-type'], args.name);
  } catch (err) {
    if (!args['existing-user-id']) {
      console.error('profile creation failed, rolling back auth user:', err.message);
      await deleteAuthUser(userId);
    }
    throw err;
  }

  console.log(`profile set: ${userId} -> org_type=${args['org-type']}${args.name ? `, name=${args.name}` : ''}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
