# MCP Tooling Guide

This project exposes an MCP JSON-RPC endpoint at `POST /resources/mcp` with optional
SSE keep-alive support at `GET /resources/mcp`.

## Local setup

1. Ensure the app is running:

```sh
npm run dev
```

2. Configure MCP dev auth:

- `MCP_DEV_TOKEN` in `.env`
- `X-MCP-User-Id` header set to a valid user ID

Example (CLI):

```sh
MCP_DEV_TOKEN=your-token \
MCP_USER_ID=your-user-id \
tsx scripts/mcp-smoke.ts
```

## MCP Jam / Inspector configuration

- **URL**: `http://localhost:3000/resources/mcp`
- **Connection type**: HTTP
- **Authentication**: No Authentication
- **Custom headers**:
  - `Authorization: Bearer <MCP_DEV_TOKEN>`
  - `X-MCP-User-Id: <USER_ID>`

If your client cannot send custom headers for SSE, append query params instead:

```
http://localhost:3000/resources/mcp?mcp_token=<MCP_DEV_TOKEN>&mcp_user_id=<USER_ID>
```

## Example JSON-RPC payloads

Initialize:

```json
{ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {} }
```

List tools:

```json
{ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} }
```

Tool names exposed via `tools/list` are Anthropic-safe (underscored). Core tools include:

- `org_list` / `org_get`
- `property_list` / `property_get`
- `asset_list` / `asset_get`
- `lease_list` / `lease_get`
- `maintenance_list` / `maintenance_get`
- `vendor_list` / `vendor_get`
- `document_list` / `document_get`
- `finance_list` / `finance_get`
- `timeline_list`
- `note_list`
- `draft_create_property`
- `draft_create_asset`
- `draft_create_maintenance`
- `draft_update_maintenance`
- `draft_create_note`
- `draft_create_document`
- `draft_create_lease`
- `draft_create_finance`
- `draft_list`
- `draft_get`
- `draft_preview`

Use `tools/call` with those names.

List orgs:

```json
{ "jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": { "name": "org_list", "arguments": {} } }
```

List properties:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "property_list",
    "arguments": { "organizationId": "ORG_ID" }
  }
}
```

## Draft schema summary (strict)

All `draft_create_*` tools require:
- `organizationId`
- `data`
- `reasoningSummary`

Optional:
- `label`
- `confidence` (0–1)
- `agentContext` with `agentName`, `sourceTool`, `sourceRunId`

`data` schemas (strict, no extra fields):

- `draft_create_property`
  - Required: `name`, `address`, `purchaseDate`, `purchasePrice`, `ownershipType`, `status`
  - Optional: `country`, `notes`
- `draft_create_asset`
  - Required: `propertyId`, `assetType`
  - Optional: `installDate`, `brandModel`, `notes`
- `draft_create_maintenance`
  - Required: `propertyId`, `dateReported`, `severity`, `status`, `description`
  - Optional: `cost`, `assetId`, `vendorId`
- `draft_update_maintenance`
  - Required: `maintenanceEventId`, `status`
- `draft_create_lease`
  - Required: `propertyId`, `tenantName`, `leaseStartDate`, `monthlyRent`, `securityDeposit`, `paymentDueDay`
  - Optional: `leaseEndDate`
- `draft_create_finance`
  - Required: `propertyId`, `date`, `amount`, `category`
  - Optional: `notes`, `vendorId`, `maintenanceEventId`
- `draft_create_note`
  - Required: `entityType`, `entityId`, `body`
  - Optional: `tags`, `isDecisionNote`
- `draft_create_document`
  - Required: `propertyId`, `documentType`, `date`, `fileKey`
  - Optional: `aiSummary`, `notes`, `assetId`

Read property timeline:

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "timeline_list",
    "arguments": {
      "organizationId": "ORG_ID",
      "propertyId": "PROPERTY_ID",
      "limit": 10,
      "includeAuditLogs": false
    }
  }
}
```

List financial entries:

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "finance_list",
    "arguments": { "organizationId": "ORG_ID", "propertyId": "PROPERTY_ID" }
  }
}
```

Create a draft asset (AI metadata included):

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "draft_create_asset",
    "arguments": {
      "organizationId": "ORG_ID",
      "label": "Add water heater",
      "reasoningSummary": "Captured from insurance inspection notes.",
      "confidence": 0.72,
      "data": {
        "propertyId": "PROPERTY_ID",
        "assetType": "WATER_HEATER",
        "installDate": "2018-08-10",
        "brandModel": "Rheem X200",
        "notes": "Installed prior to acquisition."
      },
      "agentContext": {
        "agentName": "mcp-jam",
        "sourceTool": "mcp-inspector",
        "sourceRunId": "run-123"
      }
    }
  }
}
```

Create a draft document:

```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "method": "tools/call",
  "params": {
    "name": "draft_create_document",
    "arguments": {
      "organizationId": "ORG_ID",
      "label": "Insurance policy",
      "reasoningSummary": "User uploaded updated policy PDF.",
      "confidence": 0.82,
      "data": {
        "propertyId": "PROPERTY_ID",
        "documentType": "INSURANCE",
        "date": "2025-01-15",
        "fileKey": "uploads/policies/2025-policy.pdf",
        "aiSummary": "Policy covers water damage and HVAC.",
        "notes": "Renewal due Jan 2026."
      },
      "agentContext": {
        "agentName": "mcp-jam",
        "sourceTool": "mcp-inspector",
        "sourceRunId": "run-456"
      }
    }
  }
}
```

Create a draft note:

```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "method": "tools/call",
  "params": {
    "name": "draft_create_note",
    "arguments": {
      "organizationId": "ORG_ID",
      "label": "Maintenance observation",
      "reasoningSummary": "User mentioned recurring leak under sink.",
      "confidence": 0.68,
      "data": {
        "entityType": "property",
        "entityId": "PROPERTY_ID",
        "body": "## Recurring leak\n- Tenant reported leak under sink again.\n- Likely needs inspection.",
        "tags": ["maintenance", "tenant"],
        "isDecisionNote": false
      },
      "agentContext": {
        "agentName": "mcp-jam",
        "sourceTool": "mcp-inspector",
        "sourceRunId": "run-789"
      }
    }
  }
}
```

Update a maintenance event (resolve):

```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "method": "tools/call",
  "params": {
    "name": "draft_update_maintenance",
    "arguments": {
      "organizationId": "ORG_ID",
      "label": "Resolve bathroom tile issue",
      "reasoningSummary": "Vendor confirmed the repair is complete.",
      "confidence": 0.7,
      "data": {
        "maintenanceEventId": "MAINTENANCE_ID",
        "status": "RESOLVED"
      },
      "agentContext": {
        "agentName": "mcp-jam",
        "sourceTool": "mcp-inspector",
        "sourceRunId": "run-101"
      }
    }
  }
}
```

## MCP tool invocation log

Admins can review MCP tool calls at:

- `GET /admin/mcp`

It supports filters for method, status, workspace, actor, and actor type.
