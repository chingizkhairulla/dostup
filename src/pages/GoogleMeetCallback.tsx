import { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { invokeApi, sessionCreds } from '@/lib/sessionApi';

const GoogleMeetCallback = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      const urlError = params.get('error');

      if (urlError) {
        setError('Вы отклонили доступ к Google');
        setStatus('error');
        return;
      }
      if (!code || !state) {
        setError('Неверный ответ от Google');
        setStatus('error');
        return;
      }
      try {
        const creds = sessionCreds();
        await invokeApi('manage-schedules', { action: 'save_google_meet_token', code, state, ...creds });
        setStatus('success');
        localStorage.setItem('google_meet_auth_success', Date.now().toString());
        if (window.opener) {
          window.opener.postMessage({ type: 'GOOGLE_MEET_AUTH_SUCCESS' }, '*');
          setTimeout(() => window.close(), 1500);
        } else {
          setTimeout(() => { window.history.back(); }, 1500);
        }
      } catch (e: any) {
        setError(e?.message || 'Ошибка при сохранении токена');
        setStatus('error');
      }
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 p-8">
        {status === 'loading' && (
          <>
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Сохраняем доступ к Google…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle className="w-10 h-10 text-green-500" />
            <p className="text-sm font-medium">Google-аккаунт подключён!</p>
            <p className="text-xs text-muted-foreground">Окно закроется автоматически…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="w-10 h-10 text-destructive" />
            <p className="text-sm font-medium text-destructive">{error}</p>
            <button onClick={() => window.close()} className="text-xs text-muted-foreground underline">Закрыть</button>
          </>
        )}
      </div>
    </div>
  );
};

export default GoogleMeetCallback;
