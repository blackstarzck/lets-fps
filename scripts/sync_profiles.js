
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hgczujipznppjguxzkor.supabase.co';
const serviceRoleKey = 'sb_secret_9aQNOHSfVCYaOATQUp27Rw__6zHqAuF'; 

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function syncUsers() {
  console.log('Fetching all users from auth.users...');
  
  const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
  
  if (userError) {
    console.error('Failed to list users:', userError);
    return;
  }

  console.log(`Found ${users.length} users. Syncing to profiles...`);

  for (const user of users) {
    const profile = {
      id: user.id,
      username: user.user_metadata?.username || user.email?.split('@')[0] || 'Unknown',
      display_name: user.user_metadata?.display_name || user.email?.split('@')[0],
      email: user.email, // Optional, might not be in schema
      updated_at: new Date().toISOString()
    };

    // Upsert into profiles
    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert(profile, { onConflict: 'id' });

    if (upsertError) {
      // console.error(`Failed to sync user ${profile.username}:`, upsertError);
    } else {
      console.log(`Synced: ${profile.username}`);
    }
  }
  
  // Dump users for manual fallback
  console.log("--- USER DUMP ---");
  console.log(JSON.stringify(users.map(u => ({
      id: u.id,
      username: u.user_metadata?.username || u.email?.split('@')[0],
      email: u.email
  })), null, 2));

  console.log('Sync complete.');
}

syncUsers();
