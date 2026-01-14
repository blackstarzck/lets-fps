import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Auth helpers
export async function signUp(email, password, username) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        display_name: username
      }
    }
  })
  return { data, error }
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  return { data, error }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession()
  return { session, error }
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback)
}

// Fallback profiles (since profiles table might be missing)
const FALLBACK_PROFILES = [
  { id: "a68d0bb1-baef-4eac-ba3f-d24d8ddede2a", username: "kkh20", email: "kkh20@keduall.com" },
  { id: "831d087e-4604-4031-b847-563558db1306", username: "ellie", email: "nguyenngoclinhforwork@gmail.com" },
  { id: "b2624e9d-937c-420c-bbaf-b46042c69dcf", username: "ellie", email: "ellie284@fiktechglobal.com" },
  { id: "e2568e41-76f3-474c-b1f4-9daf8a0d4021", username: "Ellias", email: "whiterat309@gmail.com" },
  { id: "6c5c9709-8a96-49a2-8843-59297e4c7b9b", username: "ellie", email: "ellie284@keduall.com" },
  { id: "4591dbec-1f58-4647-b2d7-bc76abe28370", username: "이히히히", email: "hinul@hanmail.net" },
  { id: "aab49b55-87fb-47ec-b0bb-3eefb3925ec2", username: "chanchan3", email: "blackstarzck@naver.com" },
  { id: "129c7958-aa64-43ba-9f0a-61866947cf10", username: "이히히히", email: "hinul@keduall.com" },
  { id: "c05143bd-8669-4f11-85c1-12f3e14f9975", username: "STGstudent01", email: "gaara9910@gmail.com" },
  { id: "3a2745f7-4954-4c89-a4de-d23e74dd9a06", username: "chanchan2", email: "bucheongosok@gmail.com" }
]

export async function getAllProfiles() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
    
    if (error || !data || data.length === 0) {
      console.warn('Using fallback profiles due to error:', error)
      return FALLBACK_PROFILES
    }
    return data
  } catch (err) {
    console.error('Failed to fetch profiles, using fallback:', err)
    return FALLBACK_PROFILES
  }
}
