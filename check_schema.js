
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hgczujipznppjguxzkor.supabase.co';
// const supabaseKey = 'sb_publishable_8FyyINl32mfSgvApoHdAbQ_ZcDEXpRW'; 
const serviceRoleKey = 'sb_secret_9aQNOHSfVCYaOATQUp27Rw__6zHqAuF'; // Service Role Key for admin tasks

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function check() {
  console.log("--- Checking Storage Buckets ---");
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  if (bucketError) console.error("Bucket Error:", bucketError);
  else {
    console.log("Buckets:", buckets.map(b => b.name));
    
    // Check files in 'character-models' or similar
    const bucketName = buckets.find(b => b.name.includes('model') || b.name.includes('character'))?.name || 'character-models';
    console.log(`Checking files in bucket: ${bucketName}`);
    
    const { data: files, error: fileError } = await supabase.storage.from(bucketName).list();
    if (fileError) console.error("File Error:", fileError);
    else console.log("Files:", files.map(f => f.name));
  }

  console.log("\n--- Checking Profiles Table ---");
  // Try to select from profiles
  const { data: profiles, error: dbError } = await supabase.from('profiles').select('*').limit(1);
  if (dbError) {
    console.error("Profiles Table Error:", dbError);
  } else {
    console.log("Profiles Table exists.");
    if (profiles.length > 0) {
      console.log("Sample Profile Keys:", Object.keys(profiles[0]));
    } else {
      console.log("Profiles table is empty. Trying to insert dummy to check columns if possible, or assume standard schema.");
      // Attempt to check columns by intentional error or metadata? 
      // Just assuming standard for now, but will log existence.
    }
  }
}

check();
