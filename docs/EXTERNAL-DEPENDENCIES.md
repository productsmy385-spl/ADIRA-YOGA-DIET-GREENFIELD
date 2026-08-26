# External Dependencies & Production Integration Status

This document outlines the current setup, requirements, missing credentials, and production constraints for third-party integrations in Adira Wellness.

---

## 1. Email & OTP Delivery (Resend)

### Current Status
- **Environment**: Sandbox / Development mode (`onboarding@resend.dev`)
- **API Key**: Sandbox key configured in `.env.local`

### Constraints & Impact
- Resend sandbox mode only allows email delivery to the single address registered on the Resend account.
- Invitation/activation emails sent to any other email address will fail with `403` delivery errors (`otp.issue FAILURE DELIVERY_FAILED`).

### Production Requirements
To enable unrestricted email delivery for production customer/staff invitations:
1. Register a verified domain in Resend (e.g. `mail.adira.wellness` or `adira.com`).
2. Add DNS records (SPF, DKIM, DMARC) provided by Resend.
3. Update production environment variables:
   ```env
   RESEND_API_KEY=re_live_xxxxxxxxxxxxxxxx
   OTP_FROM_EMAIL=no-reply@yourdomain.com
   ```

---

## 2. Media Upload & Storage (ImageKit)

### Current Status
- **Environment**: Not configured (missing credentials).
- **Backend/Frontend status**: Client image upload features are gracefully blocked when variables are absent.

### Required Environment Variables
To enable media/image uploads (profile photos, custom exercise media, attachments):
```env
IMAGEKIT_PUBLIC_KEY=public_xxxxxxxxxxxxxxxx
IMAGEKIT_PRIVATE_KEY=private_xxxxxxxxxxxxxxxx
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_account_id
```

---

## 3. 3D Yoga Experience (GLB Model Asset)

### Current Status
- **Engine**: Fully built using `@react-three/fiber`, `@react-three/drei`, `three.js`.
- **Decoders**: Draco and KTX2 decoders configured in `/public/decoders/`.
- **Model Asset**: Production GLB asset is **NOT** included in the repository due to licensing/filesize constraints.
- **Fallback**: The application renders a custom HTML/Canvas fallback animation (`yoga-fallback.tsx`) whenever the GLB file is missing or fails to load.

### Requirements for Production GLB Integration
When a licensed 3D model asset is acquired, place it at `/public/experience/yoga/model.glb`.

Asset requirements:
- **File size**: ≤ 3 MB
- **Geometry**: ≤ 25,000 triangles
- **Skeleton**: ≤ 75 bones
- **Skinning**: ≤ 4 influences per vertex
- **Animation clips**: Standard clip names mapped in `src/components/3d/yoga-clips.ts`
- **Rights**: Verified commercial/SaaS redistribution license
