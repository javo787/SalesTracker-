import axios from 'axios';

export async function verifyGoogleToken(idToken: string) {
  try {
    const response = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    const payload = response.data;

    const expectedAudience = process.env.GOOGLE_CLIENT_ID;
    if (expectedAudience && payload.aud !== expectedAudience) {
      console.error('Google token audience mismatch:', payload.aud, 'expected:', expectedAudience);
      return null;
    }

    return payload;
  } catch (error) {
    console.error('Google token verification error:', error);
    return null;
  }
}
