// Re-export the Supabase client as `db` so the app uses Supabase instead of the Netlify-specific drizzle driver.
// NOTE: Some parts of the codebase may have used the drizzle ORM API. Those call sites will need to be migrated
// to use the Supabase client methods (from @supabase/supabase-js). This file provides the central switch.

import { supabase } from "@/integrations/supabase/client";

export const db = supabase;
