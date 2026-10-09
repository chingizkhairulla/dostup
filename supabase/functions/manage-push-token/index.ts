import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dostup-session, x-creator-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
}

/**
 * Validate caller identity:
 * - For creators: check creator_sessions table
 * - For students/teachers: check simple_users table by userId
 */
async function validateIdentity(
  supabase: any,
  userRole: string,
  creatorToken?: string,
  creatorName?: string,
  userId?: string
): Promise<boolean> {
  if (userRole === 'creator') {
    if (!creatorToken || !creatorName) {
      console.log('Creator role requires creatorToken and creatorName');
      return false;
    }
    const { data: session } = await supabase
      .from('creator_sessions')
      .select('id')
      .eq('token', creatorToken)
      .eq('creator_name', creatorName)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    
    if (!session) {
      console.log('Invalid creator session for:', creatorName);
      return false;
    }
    return true;
  }

  if (userRole === 'moderator') {
    const token = creatorToken || userId;
    if (!token) {
      console.log('Moderator role requires token');
      return false;
    }
    const { data: session } = await supabase
      .from('moderator_sessions')
      .select('id')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    
    if (!session) {
      console.log('Invalid moderator session');
      return false;
    }
    return true;
  }

  // For students/teachers: verify user exists in simple_users by id
  if (userId) {
    const { data: user } = await supabase
      .from('simple_users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (user) return true;
  }

  console.log('User not found in simple_users:', userId);
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { action, userId, userRole, fcmToken, deviceInfo, creatorToken, creatorName } = await req.json()

    if (!action || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing action or userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // --- Validate caller identity ---
    const isValid = await validateIdentity(
      supabase,
      userRole || 'student',
      creatorToken,
      creatorName,
      userId
    );

    if (!isValid) {
      console.warn(`Unauthorized manage-push-token call for ${userId} (role: ${userRole})`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - identity validation failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if userId is a valid UUID (creators use string names)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

    switch (action) {
      case 'register': {
        if (!fcmToken) {
          return new Response(
            JSON.stringify({ error: 'Missing fcmToken for register action' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Delete any existing token with this fcm_token (device reuse)
        await supabase
          .from('push_tokens')
          .delete()
          .eq('fcm_token', fcmToken)

        // Delete old tokens for this user/device
        if (userRole === 'moderator') {
          await supabase
            .from('push_tokens')
            .delete()
            .eq('user_role', 'moderator')
            .eq('device_info', deviceInfo || '')
        } else if (isUuid) {
          await supabase
            .from('push_tokens')
            .delete()
            .eq('user_id', userId)
            .eq('user_role', userRole || 'student')
        } else {
          // For creators (non-UUID), delete by role only
          await supabase
            .from('push_tokens')
            .delete()
            .eq('user_role', 'creator')
            .eq('device_info', deviceInfo || '')
        }

        const { error } = await supabase
          .from('push_tokens')
          .insert({
            user_id: (userRole === 'creator' || userRole === 'moderator') ? null : (isUuid ? userId : null),
            user_role: userRole || 'student',
            fcm_token: fcmToken,
            device_info: deviceInfo || null,
            updated_at: new Date().toISOString()
          })

        if (error) {
          console.error('Error registering push token:', error)
          return new Response(
            JSON.stringify({ error: 'Failed to register token' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        console.log(`Token registered for ${userId} (${userRole})`)
        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'unregister': {
        let deleteQuery = supabase.from('push_tokens').delete()
        
        if (fcmToken) {
          deleteQuery = deleteQuery.eq('fcm_token', fcmToken)
        } else if (userRole === 'moderator') {
          deleteQuery = deleteQuery.eq('user_role', 'moderator')
        } else if (isUuid) {
          deleteQuery = deleteQuery.eq('user_id', userId)
        } else {
          deleteQuery = deleteQuery.eq('user_role', 'creator')
        }

        const { error } = await deleteQuery

        if (error) {
          console.error('Error unregistering push token:', error)
          return new Response(
            JSON.stringify({ error: 'Failed to unregister token' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        console.log(`Token(s) unregistered for ${userId}`)
        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

  } catch (error) {
    console.error('Error managing push token:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
