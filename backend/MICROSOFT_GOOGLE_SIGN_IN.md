# Turning on Microsoft / Google sign-in

Principal and Admin can sign in with the school's Microsoft 365 or Google Workspace account
instead of a password. The email code to the school mailbox still follows every time.

The buttons stay hidden until the keys below are set. You need only the one your school uses.

## The address to register

Both providers ask for a **redirect URI**: the page they send people back to. Use your app's real
address followed by `/login/idp-callback`, for example:

```
https://app.yourschool.in/login/idp-callback
```

For testing on this computer, use `http://localhost:3000/login/idp-callback` instead.

## Microsoft (Microsoft 365 / Entra ID)

1. Sign in to <https://entra.microsoft.com> with an admin account of the school's tenant.
2. **Applications → App registrations → New registration**.
   - Name: `FutureSchool`.
   - Supported account types: **Accounts in this organizational directory only**. This lets only your school's accounts in.
   - Redirect URI: platform **Web**, the address above.
3. On the app's **Overview** page, copy the **Application (client) ID** and the **Directory (tenant) ID**.
4. **Certificates & secrets → New client secret**. Copy the **Value** straight away; Microsoft shows it only once.
5. Set these on the server:

```
MS_CLIENT_ID=<Application (client) ID>
MS_CLIENT_SECRET=<client secret value>
MS_TENANT=<Directory (tenant) ID>
IDP_REDIRECT_URI=https://app.yourschool.in/login/idp-callback
```

## Google (Google Workspace)

1. Open <https://console.cloud.google.com>. Create a project named `FutureSchool`.
2. **APIs & Services → OAuth consent screen**. Choose user type **Internal** (only your Workspace domain), then fill in the app name and support email.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Authorized redirect URIs: the address above.
4. Copy the **Client ID** and **Client secret**.
5. Set these on the server:

```
GOOGLE_CLIENT_ID=<Client ID>
GOOGLE_CLIENT_SECRET=<Client secret>
IDP_REDIRECT_URI=https://app.yourschool.in/login/idp-callback
```

## After the keys are set

- Restart the backend. The button appears on the Principal / Admin sign-in screen.
- **First time:** the person signs in with Microsoft/Google, then enters the email code. From then on their account is linked to that Microsoft/Google account.
- **New Admins:** they can accept their invitation with Microsoft/Google instead of choosing a password.
- **Never share the secrets** in chat or email, and never put them in the code. They live only in the server's settings.
- The server refuses to start in production if `IDP_REDIRECT_URI` is not an `https` address.

## How it is protected

- The secret and the sign-in check stay on the server: the code exchange uses PKCE.
- Each ID token is checked for:
  - the provider's signature;
  - your app as its audience;
  - the issuer;
  - expiry;
  - a one-time value tied to this sign-in.
- Accounts are matched by the provider's permanent ID (Microsoft tenant + object ID, Google subject), never by the email text. A new link is made only after the email code proves the person controls that school mailbox.
- A Google email that Google has not verified is never used to find an account.
