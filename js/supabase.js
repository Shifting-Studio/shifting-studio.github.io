
import { createClient } from
  "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl =
  "https://zznemxeaccvzcrgkjqmi.supabase.co";

// Replace this with YOUR publishable key.
const supabaseKey = "sb_publishable_hFnRMxKOCk0hGHHE6PxWXA_cu3U1iYy";

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
);
