# Agentic Wallets Dashboard

**TON Agentic Wallet** is a wallet designed specifically for AI agents. It allows an agent to interact autonomously with the TON blockchain while keeping the user in full control of the wallet.

This dashboard lets you manage agentic wallets, create new ones, deposit and withdraw assets, change the operator key, revoke access, and view an activity feed for each agent.

## Run

From the repository root:

```bash
pnpm install && pnpm dev
```

The app starts at `http://localhost:5173`.

## Routes

- `/` — dashboard with the list of agents.
- `/create` — agent creation form.
- `/agent/:id` — page for a specific agent.

## Core Functionality

1. Detecting the owner's agents:
- load the owner's NFTs directly from the configured agentic collection;
- additionally load the wallets' on-chain state.

2. Creating an agent (`/create`):
- enter the `origin operator public key`, name, and source;
- calculate the index and deterministic agentic wallet address;
- deploy and perform the initial funding with GRAM and/or assets in a single flow.

3. Agent operations:
- `fund` (GRAM / jetton / NFT);
- `withdraw all` (or selectively, depending on the UI modal);
- `revoke` (set the operator key to `0`);
- `change public key`;
- `rename`.

4. Activity feed:
- classify actions (`ton`, `jetton`, `nft`, `swap`, `contract`, `agent_ops`);
- deduplicate by hash;
- periodic polling (`VITE_AGENTIC_ACTIVITY_POLL_MS`).

## Deep Links

### Wallet Creation (`/create`)

The agent creation page supports form prefill via URL query parameters.

Base format:

```text
/create?...
```

Compact format:

```text
/create?data=<base64url(JSON.stringify(payload))>
```

Supported scalar parameters:
- `network`: expected network for the connected wallet. Supported values are `mainnet`, `testnet`, `-239`, `239`, `-3`, `3`. If the parameter does not match the connected wallet's network, agent creation fails with an error.
- `originOperatorPublicKey` (aliases: `operatorPublicKey`, `operatorPubkey`, `operator`, `pubkey`)
- `agentName` (alias: `name`)
- `source`
- `callbackUrl` (aliases: `callback`, `webhookUrl`, `webhook`)
- `tonDeposit` (aliases: `ton`, `tonAmount`)

Supported asset parameters:
- `assets=<json-array>`: a URL-encoded JSON array of objects like `{"kind":"jetton","address":"EQ...","amount":"12.5"}` or `{"kind":"nft","address":"EQ..."}`; `symbol` and `label` are also supported for fallback matching
- repeated `asset`: `asset=jetton:<address>:<amount>` or `asset=nft:<address>`
- repeated `jetton` / `nft`: `jetton=<address>:<amount>` and `nft=<address>`
- `data=<base64url(JSON)>`: a base64url-encoded JSON object containing the same scalar fields and asset fields as above; direct query parameters still work and override values from `data` when both are present

Prefill behavior:
- scalar fields are applied once when the page opens;
- assets are applied after the owner's jettons/NFTs are loaded;
- asset matching is done by address first, and for `assets=<json-array>` a fallback by `symbol` and `label` is possible;
- unknown or unavailable assets are ignored;
- `amount` is used for `jetton`, while it is ignored for `nft`;
- the asset count is limited by `max outgoing messages - 1`.

Examples:

```text
/create?network=mainnet&operator=0x1234&name=Research%20Agent&source=telegram-bot&ton=0.2
/create?network=testnet&pubkey=0x1234&agentName=Ops%20Agent&asset=jetton:EQC...:15.75&asset=nft:EQD...
/create?data=eyJuZXR3b3JrIjoibWFpbm5ldCIsIm9wZXJhdG9yUHVibGljS2V5IjoiMHgxMjM0IiwiYWdlbnROYW1lIjoiUmVzZWFyY2ggQWdlbnQiLCJzb3VyY2UiOiJ0ZWxlZ3JhbS1ib3QiLCJ0b25EZXBvc2l0IjoiMC4yIn0
/create?network=-239&originOperatorPublicKey=0x1234&agentName=A1&source=api&callbackUrl=https%3A%2F%2Fexample.com%2Fagent-wallet-created&tonDeposit=0.35&assets=%5B%7B%22kind%22%3A%22jetton%22%2C%22address%22%3A%22EQC...%22%2C%22amount%22%3A%2212.5%22%7D%2C%7B%22kind%22%3A%22nft%22%2C%22address%22%3A%22EQD...%22%7D%5D
```

### Changing `operatorPublicKey` (`/agent/:id`)

The agent page supports a deep link that opens the key change modal immediately and can optionally prefill the new value.

Supported query parameters:
- new key value: `nextOperatorPublicKey`, `newOperatorPublicKey`, `operatorPublicKey`, `operatorPubkey`, `operator`, `pubkey`
- explicit modal open flag: `action=change-public-key`, `modal=change-public-key`, `changePublicKey`, `change-public-key`, `updateOperatorPublicKey`, `update-operator-public-key`

Examples:

```text
/agent/EQ...?operatorPublicKey=0x1234
/agent/EQ...?action=change-public-key&operatorPublicKey=0x1234
```

The key can be passed in hex format (`0x...`) or decimal. After the modal opens, the service query parameters are removed from the URL.

## Additional Commands

- production build: `pnpm build`
- preview build: `pnpm preview`
- typecheck: `pnpm typecheck`

## Analytics

The app supports GA4 collection for landing-page traffic and CTA conversion reporting in Looker Studio.

Configure the GA4 web stream measurement ID:

```bash
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

For preview debugging, optionally set:

```bash
VITE_GA_DEBUG_MODE=true
```

When the variable is missing, the analytics helper is a no-op and the Google script is not loaded. In Vercel, add
`VITE_GA_MEASUREMENT_ID` to the project environment variables for the preview/production deployments that should collect
analytics. Redeploy after changing Vercel environment variables.

Tracked events:

- SPA `page_view` on route changes, with sensitive URLs normalized (`/agent/:id`) and only campaign query params preserved.
- `landing_cta_click` for landing CTA links. Mark this event as a GA4 key event/conversion.
- `wallet_connect_click`, `agent_create_success`, and `agent_create_error` as secondary funnel context.

Suggested Looker Studio report widgets:

- scorecards: Active users, New users, Engagement rate, Views per user;
- time series: Active users and New users by date;
- traffic source table: Session source / medium, Session default channel group, Active users, New users, Engagement rate;
- conversion chart: `landing_cta_click` count and event rate by source / medium.

Verification:

- open the deployed site with a clean browser profile and filter Network by `collect`;
- confirm requests to `https://www.google-analytics.com/g/collect` or `https://region1.google-analytics.com/g/collect`;
- click a landing CTA and confirm the request includes `en=landing_cta_click`;
- when `VITE_GA_DEBUG_MODE=true`, use GA4 DebugView to inspect `page_view` and `landing_cta_click`.

## Environment Configuration

File: `src/core/configs/env.ts`.

Key variables:
- `VITE_GA_MEASUREMENT_ID`
- `VITE_GA_DEBUG_MODE`
- `VITE_TON_API_PROVIDER` (`toncenter` by default, `tonapi` to switch provider)
- `VITE_TON_API_KEY`
- `VITE_TON_API_TESTNET_KEY`
- `VITE_TON_API_MIN_REQUEST_INTERVAL_MS`
- `VITE_AGENTIC_COLLECTION_MAINNET`
- `VITE_AGENTIC_COLLECTION_TESTNET`
- `VITE_AGENTIC_WALLET_CODE_BOC`
- `VITE_AGENTIC_OWNER_OP_GAS`
- `VITE_AGENTIC_ACTIVITY_POLL_MS`
