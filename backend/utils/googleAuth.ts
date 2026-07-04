import axios from 'axios';

export async function verifyGoogleToken(idToken: string) {
  console.log('[AUTH_LOG][google:verify] entry'); // AUTH_LOG
  try {
    const response = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    const payload = response.data;

    const expectedAudience = process.env.GOOGLE_CLIENT_ID;
    if (expectedAudience && payload.aud !== expectedAudience) {
      console.error('[AUTH_LOG][google:verify] Google token audience mismatch:', payload.aud, 'expected:', expectedAudience); // AUTH_LOG
      return null;
    }

    console.log('[AUTH_LOG][google:verify] success sub=', payload.sub, 'email=', payload.email); // AUTH_LOG
    return payload;
  } catch (error) {
    console.error('[AUTH_LOG][google:verify] Google token verification error:', error); // AUTH_LOG
    return null;
  }
}
