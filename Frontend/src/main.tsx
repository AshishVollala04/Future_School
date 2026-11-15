import {createRoot} from 'react-dom/client';
import './i18n/index';
import App from './App.tsx';
import './index.css';

// Purge temporary frontend mock storage so real database records take precedence
[
  'futureschool_homework', 'futureschool_fees', 'futureschool_notices', 'futureschool_attendance', 'futureschool_leaves',
  // Pre-AuthService session + credential keys: force a fresh sign-in through the new flow.
  'futureschool_authenticated_user_v1', 'futureschool_auth_token_v1', 'futureschool_custom_passwords_v1',
  'futureschool_auth_invitations_v1', 'futureschool_auth_email_changes_v1', 'futureschool_cached_child_data',
  // Pre-TenantProvider global (non school-scoped) state.
  'futureschool_active_tenant_id', 'futureschool_all_tenants_v1', 'futureschool_master_workflow_v1',
  'futureschool_master_workflow_v2', 'futureschool_auth_audit_v1'
].forEach(k => {
  try {
    localStorage.removeItem(k);
  } catch {}
});

createRoot(document.getElementById('root')!).render(<App />);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
