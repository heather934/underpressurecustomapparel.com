# Under Pressure Custom Apparel — Admin Site User Manual

This manual covers the **admin site** (this `admin-site/` deployment) — the
internal dashboard used to run Under Pressure Custom Apparel day to day:
tracking orders, managing team stores, checking profit, and keeping
customer-facing integrations (PayPal, EmailJS, Cloudflare Images) configured.

It is a **separate deployment from the public storefront** (`customer-site/`).
The public site is what shoppers see; this admin site is for staff only —
its pages are marked `noindex, nofollow` so search engines skip it, and
access is gated at the network level by **Cloudflare Access**, not by an
in-page password. If you can load the site at all, Cloudflare has already
confirmed you're an authorized user.

---

## 1. Getting In

1. Go to the admin site's URL and sign in with the email/method your
   Cloudflare Access policy requires (magic link, SSO, etc.). This is
   configured in the Cloudflare dashboard, not in this app — see your
   Cloudflare Zero Trust → Access settings if someone new needs to be added.
2. Once you're through Access, the site loads straight into the **Admin
   Dashboard** — there's no separate in-app login step.
3. Click **🚪 Exit Admin** (top right) to close the admin panel and view the
   underlying storefront page. Reloading the site brings you straight back
   into the dashboard.

### Finding your way around

The left sidebar lists every section. Use the **Search admin...** box at the
top of the sidebar to filter the list by keyword if you're not sure which
section you need.

---

## 2. Dashboard

The landing screen. At a glance:

- **Pending Orders** — orders on the Production Board not yet marked complete.
- **Today's Orders** — new orders placed today.
- **Graphics Needed** — total print locations (front/back/etc.) still owed
  across pending orders — useful for planning a DTF print run.
- **This Week's Revenue** — last 7 days, based on order sale prices.
- **Low Stock Items** — items at or below their reorder threshold in
  Inventory (click the card to jump to Inventory).
- **Urgent Deadlines** — deadlines due within 3 days.
- **Recent Orders** and **Upcoming Deadlines** lists, each with a shortcut
  button into the full section.

---

## 3. Orders (Production Board)

The main day-to-day fulfillment screen. Every order — from the UP Sportswear
cart, a team store checkout, or one you added manually via Reorder — lands
here automatically.

**Filtering:** search box, status chips (All / Pending / Completed), and a
chip per store. Click **✕ Clear** to reset the store filter.

**Per-order row:**
- **Checkbox** — marks the order complete. This also **automatically
  deducts** matching quantities from Inventory (by name + color + size);
  un-checking restores them. If deducting pushes an item at or below its
  reorder threshold, a toast warns you.
- **🖨 Print Sheet** (per line item, when a graphic is on file) — opens a
  print-ready sheet in a new tab with the graphic image, customer, qty,
  size, color, and player name/number. Use **Print / Save as PDF** to send
  it to your DTF printer.
- **📦 Mark Ready** — emails the customer that their order is ready, using
  the "Order Ready" EmailJS template (set this up under Integrations first).
  This is a deliberate, separate action from the completion checkbox — it
  won't fire automatically when you check the box.
- **↺ Reorder** — duplicates the order as a brand-new pending order (handy
  for repeat/reprint requests).
- **+ Note** — attach a short internal note to the order.
- **✕** — remove the order from the board entirely.

**⬇ Export CSV** downloads every order/line item (store, customer, item,
player name/number, size, qty, date, status) for spreadsheets or backup.

---

## 4. Store Orders

Orders paid through PayPal on a team store, pulled in from Cloudflare KV
(populated by the `up-store-api` Worker's PayPal IPN handler). This is
separate from the Production Board until you promote an order:

- **📧 Send Order Received** — emails the customer an order confirmation
  (EmailJS "Order Confirmation" template). Shows "✅ Resend Confirmation"
  once sent, and asks before sending twice.
- **📋 Add to Production Board** — copies the order onto the Orders /
  Production Board above for fulfillment tracking. Already-added orders
  show "✓ On Board".
- **🔄 Refresh** — re-pulls the latest orders from KV (in case a payment
  just came in).
- **🗑 Clear On-Board Orders** — bulk-clears store orders that have already
  been added to the board, to tidy up the list.

---

## 5. Purchase List

An automatically-generated shopping list, built from every **pending**
(not-yet-completed) order on the Production Board, broken down by store →
item → color × size.

- Toggle each item's status: 🔴 **Need to Order**, ⚠ **Partially In Stock**,
  ✅ **In Stock**.
- Log what you actually spent per item and attach a receipt image/URL —
  this feeds the **Purchase Log** section below the list and the log's own
  CSV export.
- **⬇ Export CSV** (top of section, where shown) for the full breakdown.

Nothing to configure here — it's read-only aggregation of order data, plus
your manual status/spend tracking on top.

---

## 6. Team Stores

Manage every team/partner storefront (including the built-in **River City
Rampage** and **Rome CoC Youth T-Shirts** stores, which are fully editable
here even though they're seeded by default).

**+ Add Team Store** / **✏ Edit** opens the store builder:

- **Team Name** and **Subdomain** — the subdomain drives the store's URL
  (`.../team-store?team=yourslug`); it auto-fills from the name but you can
  override it.
- **Primary / Accent Color** — used for the store's branding; add an accent
  to get a gradient instead of a solid color.
- **Team Logo / Banner Image** — paste a URL, **🎨 Import from Canva** (paste
  a Canva share link and it extracts a thumbnail), or **📁 Upload** a file
  from your device.
- **Description** — shown on the store's card.
- **Designs Library** — upload every graphic this store will use (name +
  image URL or file upload). Each design becomes selectable on any product
  you add below.
- **Products** — build what the store sells:
  - Name, one or more **Product Type(s)** (tee, hoodie, hat, etc. — picking
    several applies the same design setup to each as its own product card).
  - Price.
  - For each side (**Front / Back / Side**), pick a design from the library.
  - **Drag positioner** — drag the design directly on the garment mockup and
    use the size slider to resize; this is exactly what the customer will
    see, so preview it before saving.
  - Available **Colors** and **Sizes** (click chips to toggle).
  - Reorder or remove products from the instance list once added; a star/
    toggle marks a product as featured.
- **Gallery Photos** — finished-order photos shown on the storefront, each
  with an optional caption.
- **Homepage Feature** checkbox — surfaces this store in a Featured section
  on the customer homepage.

**Visibility** (per store, from the Team Stores table):
- **🌐 Public** — anyone can find and shop it.
- **🔑 Code Only** — hidden until a customer enters the access code you set
  (type a code and click Save; it displays next to the store row as a
  reminder).
- **🔒 Private** — hidden from customers entirely.

**✕** deletes a store (with confirmation).

---

## 7. Customers

A customer database is built automatically from order history — there's
nothing to manually enter. Customers are grouped by email/phone/name and
show total spend, order count, and stores shopped.

- **🔍 Search** by name, email, or phone.
- Click a card to expand and see recent order history.
- **↺ Reorder** on any past order duplicates it onto the Production Board.
- **⬇ Export CSV** for the full customer list.

---

## 8. Cost Analysis

Revenue, cost, and profit margin reporting.

1. Click **💰 Set Costs** first: enter a flat **DTF Print Cost** per item
   (applies to everything), then a **Blank Cost** per item name based on
   what you actually see in your orders. Sale prices are shown for
   reference from the order data itself.
2. Choose a period: Last 30 Days, Last 90 Days, All Time, or a Custom date
   range.
3. Switch between **By Store**, **By Order**, and **By Product** views.
4. Summary cards show Total Revenue, Blank Cost, Print Cost, Gross Profit,
   and Profit Margin (color-coded: green ≥40%, yellow 20–39%, red <20%).
5. **⬇ Export CSV** for the full breakdown.

Until you set at least one cost, revenue still shows but cost/profit/margin
display as "—" with a reminder banner.

---

## 9. Inventory

Track blank stock on hand.

- **+ Add Item** — name, color, size, quantity on hand, unit cost, and a
  reorder threshold (defaults to 5 if left blank).
- Adjust quantity with the **+ / −** buttons or type a new value directly.
- Items at or below their reorder threshold are flagged **low stock** and
  show up on the Dashboard.
- Quantities **auto-deduct** when you mark a matching order complete on the
  Production Board (and restore if you un-mark it) — see Section 3.
- **⬇ Export CSV** for a full inventory report with value totals.

---

## 10. Deadlines

A simple deadline tracker, separate from individual order line items.

- **+ Add Deadline** — title (e.g. "Rampage Spring Jackets"), optional
  team/store, due date, and optional notes.
- Cards are color-coded by urgency: overdue (gray, "⚠"), urgent (red, ≤2
  days), soon (yellow, ≤7 days), and OK (green).
- **✓ Done / ↩ Undo** toggles completion; **✕** deletes.
- Deadlines due within 3 days also surface on the Dashboard.

---

## 11. Invoices

Every real order (excluding the store-registration placeholders) gets an
auto-generated, human-readable invoice number (`UP-YYMM-####`).

Click **🧾 Generate** on any order to open a printable invoice in a new tab
— print it or save as PDF to share with a coach/customer for reimbursement.

---

## 12. Discounts

Create and manage promo codes used at checkout.

- **Code** (auto-uppercased, no spaces), **Type** (Percentage or Fixed $
  amount), and **Value**.
- Optional: minimum order amount, max number of uses, expiry date, and
  which store the code applies to (All Stores or a specific one).
- **Activate / Deactivate** toggles a code without deleting it; deleting
  removes it permanently.
- Status shows as Active, Inactive, Expired, or Used Up automatically based
  on your settings and usage count.
- **⬇ Export Usage** for a CSV of codes and how often they've been redeemed.

---

## 13. Integrations

Connect the third-party services the storefront depends on. Each service
shows a **● Connected** / **○ Not Configured** status badge.

- **💳 PayPal Checkout** — paste your PayPal **Client ID** (from
  developer.paypal.com → Apps & Credentials). This is a public/publishable
  ID, safe to store here.
- **✉️ EmailJS** — Public Key and Service ID, plus a **Default Template**
  used as a fallback. You can also set a dedicated template per flow:
  - Submit a Player, Request a Quote (customer-facing forms)
  - Order Confirmation (to customer) and New Order Made (to Erin) — sent
    automatically right after checkout
  - Quote Details (2nd copy to Erin) — sent automatically alongside the
    quote email
  - Order Ready (to customer) — sent only when you click **📦 Mark Ready**
    on the Production Board

  Flow-specific templates with no default fallback are simply skipped (not
  sent) if left blank, rather than risk sending the wrong template.

- **☁️ Cloudflare Images** — Account ID and Images API Token. This is saved
  here **for reference only** — the actual uploads run through the
  `up-store-api` Worker's `/images/upload` endpoint using its own
  `CF_IMAGES_TOKEN` secret. To rotate the real key, update that secret
  directly in Cloudflare, not just this field.

Click **💾 Save** under each service — saved values are written permanently
to Cloudflare KV (shared across anyone using this admin site) and also
mirrored to your browser's local storage.

---

## 14. Data & Where It Lives

Not everything on this site is stored the same way — worth knowing before
you assume something will "just show up" on another computer:

**Synced everywhere (saved to Cloudflare KV — same for every admin, any
device):**
Team Stores & their products/designs, store visibility settings and access
codes, discount codes, Store Orders (from PayPal), and Integrations
credentials.

**Local to this browser only (saved to `localStorage` — won't appear if you
log in from a different browser or device):**
The Orders/Production Board, Inventory, Deadlines, order notes, Cost
Analysis settings (blank costs, print rate), the Purchase List's
status/spend tracking, and the Customer database (which is derived from the
Production Board).

If you regularly switch devices, stick to one browser for day-to-day order
management, or export CSVs regularly as a backup.

---

## 15. Known Limitation

The **⚙ Manage** button and the "UP Sportswear Line" quick-add product form
that appear in the underlying storefront markup are currently inactive on
this deployment (the flag that enables them is never set true here, since
Cloudflare Access replaced the old in-page admin toggle). Clicking them does
nothing. This doesn't affect anything documented above — team-store products
are managed entirely through **Team Stores** (Section 6). If the general
"UP Sportswear Line" catalog (the non-team-store product grid) needs new
items added going forward, that code path needs to be reconnected or
replaced — flag it to whoever maintains this codebase.
