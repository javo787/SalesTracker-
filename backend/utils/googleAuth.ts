import axios from 'axios';

export async function verifyGoogleToken(idToken: string) {
  try {
    const response = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    return response.data;
  } catch (error) {
    console.error('Google token verification error:', error);
    return null;
  }
}
