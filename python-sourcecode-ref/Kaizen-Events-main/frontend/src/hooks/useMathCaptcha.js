import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Distorted-image captcha for public forms.
 *
 * The server hands back a PNG (already a data URL, so there is no second request) and
 * a signed token; the token is the only thing that proves the answer, so it must be
 * posted alongside it. Tokens are single-use, which is why every submit — successful
 * or not — is followed by a fresh challenge. Forgetting that refresh is the one way to
 * make this feel broken: the visitor would retype the same characters and be rejected
 * for no visible reason.
 *
 * `question` is a fallback the server only uses if it has no font to draw with; render
 * the image when there is one and the text otherwise.
 *
 * Markup is left to the caller. The three contact forms in this app belong to two
 * different design systems, and a shared component would look foreign in at least one.
 */
export default function useMathCaptcha() {
  const [image, setImage]       = useState('');
  const [question, setQuestion] = useState('');
  const [token, setToken]       = useState('');
  const [answer, setAnswer]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    setAnswer('');
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/captcha/image`);
      setToken(data.token);
      setImage(data.image || '');
      setQuestion(data.question || '');
    } catch {
      setToken('');
      setImage('');
      setQuestion('');
      setError('Could not load the security check. Please reload the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return {
    image,
    question,
    answer,
    setAnswer,
    refresh,
    loading,
    error,
    /** True once there is a token to submit — gate the submit button on this. */
    ready: Boolean(token),
    /** Spread straight into the request body. */
    payload: { captcha_token: token, captcha_answer: answer },
  };
}
