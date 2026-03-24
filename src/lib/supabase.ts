import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xyjuhopcaclxmgorfbwx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5anVob3BjYWNseG1nb3JmYnd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzQ3NTksImV4cCI6MjA4OTg1MDc1OX0.kVLUMqZ3EeWpWlZ8FdhFrGh64ErzzZ_UJikkyxfZLQM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
