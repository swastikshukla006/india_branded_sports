# India's Branded Sports Website

A ready-to-run WhatsApp-first cricket bat catalogue with a very simple admin panel.

## What is included

- Premium responsive homepage for phone and desktop
- Six product collections with real product galleries
- Player-inspiration section using the supplied images
- WhatsApp-only ordering with an automatically prepared order message
- ₹500 booking flow and remaining COD wording
- 7-day return, delivery, shipping and custom-order sections
- Full admin panel for products, prices, stock, pictures, homepage text, contact and policies
- Product image uploads
- Render deployment configuration with a persistent disk
- Developer credit: Swastik Shukla — @swastik_shukla__

## Run on a computer

1. Install Node.js 18 or newer.
2. Open this folder in Terminal.
3. Run:

```bash
npm install
npm start
```

4. Website: `http://localhost:3000`
5. Admin: `http://localhost:3000/admin`

### Default local admin password

```text
IBS@2026
```

Change it before publishing by creating a `.env` file from `.env.example`.

## Deploy on Render

1. Upload this project to a private GitHub repository.
2. In Render, create a Blueprint and select the repository.
3. Render reads `render.yaml` automatically.
4. Set `ADMIN_PASSWORD` when asked.
5. Deploy.

The included persistent disk keeps admin changes and uploaded pictures after restarts. Some Render plans may require a paid persistent disk. If a free plan does not allow the disk, the site still runs, but uploaded/admin changes may reset after a redeployment.

## Admin usage

The admin has five simple areas:

- **Quick Edit:** heading, prices, WhatsApp and Instagram
- **Products:** add, edit, reorder, mark sold out and delete bats
- **Pictures:** replace the logo and homepage images
- **Delivery & Policy:** update delivery, returns and payment text
- **Tools:** restore the supplied original data

Orders are not managed inside the admin. Customers are sent directly to the client's WhatsApp, keeping daily work minimal.

## Important note about player imagery

The website includes a small editorial disclaimer stating that no individual athlete endorsement is implied. Confirm commercial usage rights for supplied photographs before public advertising.
