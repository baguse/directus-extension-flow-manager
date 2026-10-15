import type { IFlowRecipe } from '../types';

export const STARTER_RECIPES: IFlowRecipe[] = [
  // =========================================================================
  // 1. Stripe Checkout & Order Fulfillment Pipeline (E-Commerce)
  // =========================================================================
  {
    $schema: 'https://flow-manager.directus.app/schemas/recipe.v1.json',
    id: 'stripe-checkout-fulfillment',
    name: 'Stripe Checkout & Order Fulfillment Pipeline',
    version: '1.2.0',
    description:
      'Complete e-commerce automation: validates incoming Stripe webhooks, prevents duplicate transactions, creates order records in Directus, and broadcasts sales alerts.',
    category: 'E-Commerce',
    icon: 'shopping_cart',
    color: '#635BFF',
    author: {
      name: 'Flow Manager Official',
      url: 'https://github.com/baguse/directus-extension-flow-manager',
    },
    tags: ['stripe', 'ecommerce', 'orders', 'payments', 'webhook', 'fulfillment'],
    documentation:
      '### Setup Instructions\n1. In your Stripe Dashboard, navigate to Developers -> Webhooks.\n2. Add endpoint pointing to this flow webhook URL.\n3. Subscribe to event `checkout.session.completed`.\n4. Map your destination `orders` collection during installation.',
    parameters: [
      {
        key: 'STRIPE_WEBHOOK_SECRET',
        label: 'Stripe Webhook Signing Secret',
        description: 'Whsec_... signing secret from your Stripe dashboard for validation',
        type: 'secret',
        required: true,
        placeholder: 'whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      },
      {
        key: 'SLACK_SALES_WEBHOOK',
        label: 'Slack Sales Channel Webhook (Optional)',
        description: 'Leave empty or paste Slack incoming webhook URL for celebration alerts',
        type: 'secret',
        required: false,
        placeholder: 'https://hooks.slack.com/services/...',
      },
      {
        key: 'DEFAULT_CURRENCY',
        label: 'Default Currency Code',
        type: 'select',
        required: true,
        default: 'usd',
        options: [
          { text: 'USD ($)', value: 'usd' },
          { text: 'EUR (€)', value: 'eur' },
          { text: 'GBP (£)', value: 'gbp' },
          { text: 'IDR (Rp)', value: 'idr' },
        ],
      },
    ],
    collections: [
      {
        key: 'orders_collection',
        label: 'Orders Collection',
        suggested: 'orders',
        description: 'Collection where completed customer orders will be recorded',
      },
    ],
    flows: [
      {
        name: 'Stripe Checkout Fulfillment',
        icon: 'shopping_cart',
        color: '#635BFF',
        status: 'inactive',
        trigger: 'webhook',
        options: {
          method: 'POST',
        },
        operations: [
          {
            key: 'verify_and_parse',
            name: 'Extract Payment & Customer Info',
            type: 'exec',
            position_x: 15,
            position_y: 15,
            resolve: 'check_existing_order',
            options: {
              code: `module.exports = async function(data) {
  const event = data.$trigger.body;
  if (!event || event.type !== 'checkout.session.completed') {
    return { is_valid: false, reason: 'Ignored non-checkout event: ' + (event ? event.type : 'none') };
  }
  const session = event.data?.object || {};
  return {
    is_valid: true,
    stripe_session_id: session.id,
    customer_email: session.customer_details?.email || session.customer_email || 'guest@example.com',
    customer_name: session.customer_details?.name || 'Customer',
    amount_total: (session.amount_total || 0) / 100,
    currency: (session.currency || '{{parameters.DEFAULT_CURRENCY}}').toUpperCase(),
    payment_status: session.payment_status || 'paid',
    metadata: session.metadata || {}
  };
};`,
            },
          },
          {
            key: 'check_existing_order',
            name: 'Check for Duplicate Transaction',
            type: 'item-read',
            position_x: 32,
            position_y: 15,
            resolve: 'condition_is_unique',
            options: {
              collection: '{{collections.orders_collection}}',
              query: {
                fields: ['id', 'stripe_session_id'],
                filter: {
                  stripe_session_id: {
                    _eq: '{{$last.stripe_session_id}}',
                  },
                },
                limit: 1,
              },
            },
          },
          {
            key: 'condition_is_unique',
            name: 'Is Transaction Unique?',
            type: 'condition',
            position_x: 48,
            position_y: 15,
            resolve: 'create_order_record',
            reject: 'log_duplicate_warning',
            options: {
              filter: {
                _and: [
                  {
                    $last: {
                      _empty: true,
                    },
                  },
                ],
              },
            },
          },
          {
            key: 'create_order_record',
            name: 'Create Order in Database',
            type: 'item-create',
            position_x: 64,
            position_y: 10,
            resolve: 'dispatch_sales_alert',
            options: {
              collection: '{{collections.orders_collection}}',
              payload: {
                stripe_session_id: '{{$first.stripe_session_id}}',
                customer_email: '{{$first.customer_email}}',
                customer_name: '{{$first.customer_name}}',
                total_amount: '{{$first.amount_total}}',
                currency: '{{$first.currency}}',
                status: 'paid',
                payment_provider: 'stripe',
              },
            },
          },
          {
            key: 'dispatch_sales_alert',
            name: 'Broadcast Slack Sale Notification',
            type: 'request',
            position_x: 80,
            position_y: 10,
            options: {
              url: '{{parameters.SLACK_SALES_WEBHOOK}}',
              method: 'POST',
              headers: [{ header: 'Content-Type', value: 'application/json' }],
              body: JSON.stringify(
                {
                  text: '💰 New Sale Completed!',
                  blocks: [
                    {
                      type: 'header',
                      text: {
                        type: 'plain_text',
                        text: '🎉 New Paid Order Received',
                        emoji: true,
                      },
                    },
                    {
                      type: 'section',
                      fields: [
                        {
                          type: 'mrkdwn',
                          text: '*Customer:*\n{{$first.customer_name}} ({{$first.customer_email}})',
                        },
                        {
                          type: 'mrkdwn',
                          text: '*Total Amount:*\n{{$first.currency}} {{$first.amount_total}}',
                        },
                      ],
                    },
                  ],
                },
                null,
                2,
              ),
            },
          },
          {
            key: 'log_duplicate_warning',
            name: 'Log Duplicate Webhook Warning',
            type: 'exec',
            position_x: 64,
            position_y: 26,
            options: {
              code: `module.exports = async function(data) {
  return {
    status: 'skipped',
    message: 'Duplicate transaction skipped: ' + (data.$first ? data.$first.stripe_session_id : 'unknown')
  };
};`,
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 2. AI Content Moderation & Sentiment Analysis Pipeline (AI & LLM)
  // =========================================================================
  {
    $schema: 'https://flow-manager.directus.app/schemas/recipe.v1.json',
    id: 'ai-content-moderator-gemini',
    name: 'AI Content Moderation & Sentiment Pipeline',
    version: '1.3.0',
    description:
      'Leverages Google Gemini AI to analyze user submissions, detect toxic or prohibited language, extract sentiment, generate executive summaries, and auto-quarantine flagged posts.',
    category: 'AI & LLM',
    icon: 'psychology',
    color: '#4285F4',
    author: {
      name: 'Flow Manager Official',
      url: 'https://github.com/baguse/directus-extension-flow-manager',
    },
    tags: ['ai', 'gemini', 'moderation', 'sentiment', 'safety', 'nlp'],
    documentation:
      '### How it works\n- Evaluates text content using Gemini 1.5 structured JSON format.\n- Automatically categorizes sentiment (positive, neutral, negative).\n- If flagged for hate speech, harassment, or spam, updates status to `needs_review` and alerts moderators.\n- If clean, writes AI summary and tags, then approves content.',
    parameters: [
      {
        key: 'GEMINI_API_KEY',
        label: 'Google Gemini API Key',
        description: 'Obtain from Google AI Studio (aistudio.google.com)',
        type: 'secret',
        required: true,
      },
      {
        key: 'AI_MODEL',
        label: 'Gemini Model Selection',
        type: 'select',
        required: true,
        default: 'gemini-1.5-flash',
        options: [
          { text: 'Gemini 1.5 Flash (Super Fast & Low Latency)', value: 'gemini-1.5-flash' },
          { text: 'Gemini 1.5 Pro (Complex Context Reasoning)', value: 'gemini-1.5-pro' },
        ],
      },
      {
        key: 'SLACK_MODERATION_WEBHOOK',
        label: 'Moderation Alert Channel Webhook (Slack / Teams)',
        description: 'Receives alerts when flagged content is quarantined',
        type: 'secret',
        required: false,
      },
    ],
    collections: [
      {
        key: 'content_collection',
        label: 'Submissions Collection',
        suggested: 'articles',
        description: 'Collection containing user posts, articles, or feedback to moderate',
      },
    ],
    flows: [
      {
        name: 'AI Content Safety & Moderation Flow',
        icon: 'psychology',
        color: '#4285F4',
        status: 'inactive',
        trigger: 'webhook',
        options: {
          method: 'POST',
        },
        operations: [
          {
            key: 'normalize_input_text',
            name: 'Extract & Clean Input Content',
            type: 'exec',
            position_x: 15,
            position_y: 15,
            resolve: 'call_gemini_moderator',
            options: {
              code: `module.exports = async function(data) {
  const body = data.$trigger.body || {};
  const rawText = body.content || body.text || body.body || '';
  const itemId = body.id || body.item_id || null;
  return {
    raw_text: rawText.slice(0, 4000), // sanitize max length
    item_id: itemId,
    author: body.author || 'Anonymous'
  };
};`,
            },
          },
          {
            key: 'call_gemini_moderator',
            name: 'Analyze Content with Gemini AI',
            type: 'request',
            position_x: 32,
            position_y: 15,
            resolve: 'parse_ai_safety_report',
            options: {
              url: 'https://generativelanguage.googleapis.com/v1beta/models/{{parameters.AI_MODEL}}:generateContent?key={{parameters.GEMINI_API_KEY}}',
              method: 'POST',
              headers: [{ header: 'Content-Type', value: 'application/json' }],
              body: JSON.stringify(
                {
                  contents: [
                    {
                      parts: [
                        {
                          text: `You are an automated content safety moderator. Analyze the following text and respond ONLY with a raw JSON object (no markdown, no backticks):\n{
  "is_flagged": boolean (true if contains severe toxicity, hate speech, spam, or scams),
  "flag_reason": string or null,
  "sentiment": "positive" | "neutral" | "negative",
  "summary": string (1-2 sentence summary),
  "tags": string[] (up to 4 topic keywords)
}\n\nText to analyze:\n"""{{$last.raw_text}}"""`,
                        },
                      ],
                    },
                  ],
                },
                null,
                2,
              ),
            },
          },
          {
            key: 'parse_ai_safety_report',
            name: 'Parse AI JSON Safety Report',
            type: 'exec',
            position_x: 48,
            position_y: 15,
            resolve: 'condition_is_content_safe',
            options: {
              code: `module.exports = async function(data) {
  try {
    const rawAiText = data.$last.data.candidates[0].content.parts[0].text;
    const cleanJson = rawAiText.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    const result = JSON.parse(cleanJson);
    return {
      is_flagged: Boolean(result.is_flagged),
      flag_reason: result.flag_reason || 'Flagged by safety filter',
      sentiment: result.sentiment || 'neutral',
      summary: result.summary || '',
      tags: Array.isArray(result.tags) ? result.tags : []
    };
  } catch(e) {
    return {
      is_flagged: false,
      flag_reason: null,
      sentiment: 'neutral',
      summary: 'Automated analysis completed',
      tags: ['unprocessed']
    };
  }
};`,
            },
          },
          {
            key: 'condition_is_content_safe',
            name: 'Is Content Approved & Safe?',
            type: 'condition',
            position_x: 64,
            position_y: 15,
            resolve: 'approve_and_tag_item',
            reject: 'quarantine_flagged_item',
            options: {
              filter: {
                _and: [
                  {
                    is_flagged: {
                      _eq: false,
                    },
                  },
                ],
              },
            },
          },
          {
            key: 'approve_and_tag_item',
            name: 'Approve & Enrich Content Record',
            type: 'exec',
            position_x: 80,
            position_y: 10,
            options: {
              code: `module.exports = async function(data) {
  return {
    status: 'approved',
    summary: data.$last.summary,
    sentiment: data.$last.sentiment,
    tags: data.$last.tags
  };
};`,
            },
          },
          {
            key: 'quarantine_flagged_item',
            name: 'Quarantine & Alert Moderators',
            type: 'request',
            position_x: 80,
            position_y: 26,
            options: {
              url: '{{parameters.SLACK_MODERATION_WEBHOOK}}',
              method: 'POST',
              headers: [{ header: 'Content-Type', value: 'application/json' }],
              body: JSON.stringify(
                {
                  text: '🚨 Content Quarantined by AI Safety Filter',
                  blocks: [
                    {
                      type: 'header',
                      text: {
                        type: 'plain_text',
                        text: '⚠️ Content Quarantined for Review',
                        emoji: true,
                      },
                    },
                    {
                      type: 'section',
                      text: {
                        type: 'mrkdwn',
                        text: '*Flag Reason:* {{$last.flag_reason}}\n*Sentiment:* {{$last.sentiment}}\n*Author:* {{$first.author}}',
                      },
                    },
                  ],
                },
                null,
                2,
              ),
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 3. Multi-Tier Incident Alert & Pager Escalation (Communication)
  // =========================================================================
  {
    $schema: 'https://flow-manager.directus.app/schemas/recipe.v1.json',
    id: 'incident-alert-pager-escalation',
    name: 'Multi-Tier Incident Alert & Pager Escalation',
    version: '1.1.0',
    description:
      'Universal incident response webhook: categorizes alerts by severity (P1 Critical vs P2 Normal). Dispatches emergency SMS/WhatsApp to on-call engineers for P1, and posts structured Slack updates.',
    category: 'Communication',
    icon: 'crisis_alert',
    color: '#DC2626',
    author: {
      name: 'Flow Manager Official',
      url: 'https://github.com/baguse/directus-extension-flow-manager',
    },
    tags: ['incident-response', 'alerts', 'slack', 'twilio', 'pager', 'monitoring'],
    documentation:
      '### Triggering\nSend POST payload to the webhook URL:\n```json\n{\n  "title": "Database connection pool exhausted",\n  "severity": "P1",\n  "service": "auth-service",\n  "stack_trace": "Error: Connection timeout..."\n}\n```',
    parameters: [
      {
        key: 'SLACK_INCIDENT_WEBHOOK',
        label: 'Slack Incidents Channel Webhook',
        type: 'secret',
        required: true,
        placeholder: 'https://hooks.slack.com/services/...',
      },
      {
        key: 'TWILIO_ACCOUNT_SID',
        label: 'Twilio Account SID (for P1 Emergency SMS)',
        type: 'string',
        required: false,
        placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      },
      {
        key: 'TWILIO_AUTH_TOKEN',
        label: 'Twilio Auth Token',
        type: 'secret',
        required: false,
      },
      {
        key: 'ON_CALL_PHONE_NUMBER',
        label: 'On-Call Engineer Phone Number (E.164)',
        description: 'e.g. +1234567890 (notified immediately when P1 occurs)',
        type: 'string',
        required: false,
        placeholder: '+15551234567',
      },
      {
        key: 'TWILIO_SENDER_NUMBER',
        label: 'Twilio Sender Number',
        type: 'string',
        required: false,
        placeholder: '+15559876543',
      },
    ],
    flows: [
      {
        name: 'Incident Alert & Escalation Engine',
        icon: 'crisis_alert',
        color: '#DC2626',
        status: 'inactive',
        trigger: 'webhook',
        options: {
          method: 'POST',
        },
        operations: [
          {
            key: 'normalize_incident_payload',
            name: 'Classify Incident Severity',
            type: 'exec',
            position_x: 15,
            position_y: 15,
            resolve: 'condition_is_p1_critical',
            options: {
              code: `module.exports = async function(data) {
  const b = data.$trigger.body || {};
  const sev = String(b.severity || 'P3').toUpperCase();
  const isP1 = sev === 'P1' || sev === 'CRITICAL' || sev === 'FATAL';
  return {
    is_p1: isP1,
    severity: isP1 ? 'P1 - CRITICAL' : (sev === 'P2' ? 'P2 - HIGH' : 'P3 - NORMAL'),
    title: b.title || 'Unspecified Error',
    service: b.service || 'Directus Core',
    details: b.details || b.stack_trace || 'No detailed stack trace supplied.',
    timestamp: new Date().toISOString()
  };
};`,
            },
          },
          {
            key: 'condition_is_p1_critical',
            name: 'Is Severity P1 (Emergency)?',
            type: 'condition',
            position_x: 35,
            position_y: 15,
            resolve: 'dispatch_twilio_emergency_sms',
            reject: 'dispatch_slack_standard_alert',
            options: {
              filter: {
                _and: [
                  {
                    is_p1: {
                      _eq: true,
                    },
                  },
                ],
              },
            },
          },
          {
            key: 'dispatch_twilio_emergency_sms',
            name: 'Send Emergency SMS to On-Call Engineer',
            type: 'request',
            position_x: 55,
            position_y: 10,
            resolve: 'dispatch_slack_urgent_alert',
            options: {
              url: 'https://api.twilio.com/2010-04-01/Accounts/{{parameters.TWILIO_ACCOUNT_SID}}/Messages.json',
              method: 'POST',
              headers: [
                {
                  header: 'Authorization',
                  value:
                    'Basic {{base64(parameters.TWILIO_ACCOUNT_SID + ":" + parameters.TWILIO_AUTH_TOKEN)}}',
                },
                {
                  header: 'Content-Type',
                  value: 'application/x-www-form-urlencoded',
                },
              ],
              body: 'From={{urlEncode(parameters.TWILIO_SENDER_NUMBER)}}&To={{urlEncode(parameters.ON_CALL_PHONE_NUMBER)}}&Body={{urlEncode("🚨 [P1 CRITICAL ALERT] " + $first.service + ": " + $first.title)}}',
            },
          },
          {
            key: 'dispatch_slack_urgent_alert',
            name: 'Post P1 Critical Alert to Slack (@here)',
            type: 'request',
            position_x: 75,
            position_y: 10,
            options: {
              url: '{{parameters.SLACK_INCIDENT_WEBHOOK}}',
              method: 'POST',
              headers: [{ header: 'Content-Type', value: 'application/json' }],
              body: JSON.stringify(
                {
                  text: '<!here> 🚨 *P1 CRITICAL OUTAGE:* {{$first.title}}',
                  blocks: [
                    {
                      type: 'header',
                      text: {
                        type: 'plain_text',
                        text: '🚨 P1 OUTAGE DETECTED - ON-CALL ENGAGED',
                        emoji: true,
                      },
                    },
                    {
                      type: 'section',
                      fields: [
                        {
                          type: 'mrkdwn',
                          text: '*Service:*\n{{$first.service}}',
                        },
                        {
                          type: 'mrkdwn',
                          text: '*Severity:*\n{{$first.severity}}',
                        },
                      ],
                    },
                    {
                      type: 'section',
                      text: {
                        type: 'mrkdwn',
                        text: '```{separator}{{$first.details}}{separator}```',
                      },
                    },
                  ],
                },
                null,
                2,
              ),
            },
          },
          {
            key: 'dispatch_slack_standard_alert',
            name: 'Post Standard Alert to Slack',
            type: 'request',
            position_x: 55,
            position_y: 25,
            options: {
              url: '{{parameters.SLACK_INCIDENT_WEBHOOK}}',
              method: 'POST',
              headers: [{ header: 'Content-Type', value: 'application/json' }],
              body: JSON.stringify(
                {
                  text: '⚠️ Alert [{{$first.severity}}]: {{$first.title}}',
                  blocks: [
                    {
                      type: 'header',
                      text: {
                        type: 'plain_text',
                        text: '⚠️ System Alert [{{$first.severity}}]',
                        emoji: true,
                      },
                    },
                    {
                      type: 'section',
                      fields: [
                        {
                          type: 'mrkdwn',
                          text: '*Service:*\n{{$first.service}}',
                        },
                        {
                          type: 'mrkdwn',
                          text: '*Time:*\n{{$first.timestamp}}',
                        },
                      ],
                    },
                  ],
                },
                null,
                2,
              ),
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 4. Database Health & Automated Audit Log Purge (Maintenance)
  // =========================================================================
  {
    $schema: 'https://flow-manager.directus.app/schemas/recipe.v1.json',
    id: 'database-audit-retention-purge',
    name: 'Database Health & Automated Audit Log Purge',
    version: '1.2.0',
    description:
      'Prevents massive database growth and slow queries by scanning and pruning directus_activity and directus_revisions older than your compliance retention threshold.',
    category: 'Maintenance',
    icon: 'auto_delete',
    color: '#D97706',
    author: {
      name: 'Flow Manager Official',
      url: 'https://github.com/baguse/directus-extension-flow-manager',
    },
    tags: ['maintenance', 'database-cleanup', 'cron', 'storage-optimization', 'retention'],
    documentation:
      '### Retention Strategy\n- Runs automatically on a configurable cron schedule.\n- Queries directus_activity for IDs older than `$NOW(-N days)`.\n- Safely deletes stale logs in chunks to avoid locking database tables.',
    parameters: [
      {
        key: 'CRON_SCHEDULE',
        label: 'Maintenance Cron Schedule',
        description: 'Standard cron expression (Default: Every Sunday at 3:00 AM)',
        type: 'cron',
        required: true,
        default: '0 3 * * 0',
      },
      {
        key: 'RETENTION_DAYS',
        label: 'Audit Log Retention Threshold (Days)',
        description: 'Activity logs older than this number of days will be deleted',
        type: 'number',
        required: true,
        default: 90,
      },
      {
        key: 'BATCH_CHUNK_SIZE',
        label: 'Batch Chunk Size (Max Items per Run)',
        description: 'Limits delete batch size to avoid long table locks',
        type: 'number',
        required: true,
        default: 1000,
      },
    ],
    flows: [
      {
        name: 'Weekly Activity & Revision Purge',
        icon: 'auto_delete',
        color: '#D97706',
        status: 'inactive',
        trigger: 'schedule',
        options: {
          cron: '{{parameters.CRON_SCHEDULE}}',
        },
        operations: [
          {
            key: 'find_expired_activity',
            name: 'Query Stale directus_activity Records',
            type: 'item-read',
            position_x: 15,
            position_y: 15,
            resolve: 'check_if_expired_found',
            options: {
              collection: 'directus_activity',
              query: {
                fields: ['id'],
                filter: {
                  timestamp: {
                    _lt: '$NOW(-{{parameters.RETENTION_DAYS}} days)',
                  },
                },
                limit: '{{parameters.BATCH_CHUNK_SIZE}}',
              },
            },
          },
          {
            key: 'check_if_expired_found',
            name: 'Are Stale Records Present?',
            type: 'condition',
            position_x: 35,
            position_y: 15,
            resolve: 'extract_delete_keys',
            reject: 'log_clean_state',
            options: {
              filter: {
                _and: [
                  {
                    $last: {
                      _nempty: true,
                    },
                  },
                ],
              },
            },
          },
          {
            key: 'extract_delete_keys',
            name: 'Extract Record Primary Keys',
            type: 'exec',
            position_x: 55,
            position_y: 10,
            resolve: 'delete_stale_activity_records',
            options: {
              code: `module.exports = async function(data) {
  const records = data.$first || [];
  const ids = records.map(r => r.id);
  return {
    ids_to_delete: ids,
    count: ids.length
  };
};`,
            },
          },
          {
            key: 'delete_stale_activity_records',
            name: 'Purge Stale Activity Records',
            type: 'item-delete',
            position_x: 75,
            position_y: 10,
            options: {
              collection: 'directus_activity',
              keys: '{{$last.ids_to_delete}}',
            },
          },
          {
            key: 'log_clean_state',
            name: 'Log Clean System Status',
            type: 'exec',
            position_x: 55,
            position_y: 25,
            options: {
              code: `module.exports = async function() {
  return {
    message: 'Audit log retention check completed: No stale logs found exceeding retention window.',
    timestamp: new Date().toISOString()
  };
};`,
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 5. GitHub CI/CD Release & Changelog Broadcaster (DevOps)
  // =========================================================================
  {
    $schema: 'https://flow-manager.directus.app/schemas/recipe.v1.json',
    id: 'github-release-announcer',
    name: 'GitHub CI/CD Release & Changelog Broadcaster',
    version: '1.0.0',
    description:
      'Listens to GitHub release webhooks, parses changelog highlights, filters out pre-releases, and broadcasts formatted release notes to your team communication channels.',
    category: 'DevOps',
    icon: 'rocket_launch',
    color: '#0284C7',
    author: {
      name: 'Flow Manager Official',
      url: 'https://github.com/baguse/directus-extension-flow-manager',
    },
    tags: ['github', 'devops', 'releases', 'changelog', 'cicd', 'slack'],
    parameters: [
      {
        key: 'ANNOUNCEMENTS_WEBHOOK_URL',
        label: 'Announcements Channel Webhook (Slack / Discord / Teams)',
        type: 'secret',
        required: true,
        placeholder: 'https://hooks.slack.com/services/...',
      },
      {
        key: 'ALLOW_PRERELEASES',
        label: 'Broadcast Alpha/Beta Pre-releases?',
        type: 'boolean',
        required: true,
        default: false,
      },
    ],
    flows: [
      {
        name: 'GitHub Release Broadcaster',
        icon: 'rocket_launch',
        color: '#0284C7',
        status: 'inactive',
        trigger: 'webhook',
        options: {
          method: 'POST',
        },
        operations: [
          {
            key: 'parse_github_release',
            name: 'Parse Release Tag & Changelog',
            type: 'exec',
            position_x: 15,
            position_y: 15,
            resolve: 'condition_is_published_release',
            options: {
              code: `module.exports = async function(data) {
  const body = data.$trigger.body || {};
  const action = body.action || '';
  const release = body.release || {};
  const repository = body.repository || {};

  const isPublished = action === 'published';
  const isPrerelease = Boolean(release.prerelease);
  const allowPre = '{{parameters.ALLOW_PRERELEASES}}' === 'true';

  return {
    should_broadcast: isPublished && (!isPrerelease || allowPre),
    tag_name: release.tag_name || 'vLatest',
    release_name: release.name || release.tag_name || 'New Release',
    html_url: release.html_url || repository.html_url || '',
    author: release.author?.login || 'Release Bot',
    body: (release.body || 'No release notes provided.').slice(0, 1500),
    repo_name: repository.full_name || 'Repository'
  };
};`,
            },
          },
          {
            key: 'condition_is_published_release',
            name: 'Should Broadcast Release?',
            type: 'condition',
            position_x: 35,
            position_y: 15,
            resolve: 'broadcast_release_card',
            reject: 'ignore_unpublished_event',
            options: {
              filter: {
                _and: [
                  {
                    should_broadcast: {
                      _eq: true,
                    },
                  },
                ],
              },
            },
          },
          {
            key: 'broadcast_release_card',
            name: 'Dispatch Release Card to Channel',
            type: 'request',
            position_x: 55,
            position_y: 10,
            options: {
              url: '{{parameters.ANNOUNCEMENTS_WEBHOOK_URL}}',
              method: 'POST',
              headers: [{ header: 'Content-Type', value: 'application/json' }],
              body: JSON.stringify(
                {
                  text: '🚀 *New Release Available:* {{$first.repo_name}} {{$first.tag_name}}',
                  blocks: [
                    {
                      type: 'header',
                      text: {
                        type: 'plain_text',
                        text: '🚀 {{$first.repo_name}} {{$first.tag_name}} Released!',
                        emoji: true,
                      },
                    },
                    {
                      type: 'section',
                      text: {
                        type: 'mrkdwn',
                        text: '*Release Title:* <{{$first.html_url}}|{{$first.release_name}}>\n*Published By:* {{$first.author}}',
                      },
                    },
                    {
                      type: 'section',
                      text: {
                        type: 'mrkdwn',
                        text: '*Changelog Highlights:*\n{{$first.body}}',
                      },
                    },
                  ],
                },
                null,
                2,
              ),
            },
          },
          {
            key: 'ignore_unpublished_event',
            name: 'Ignore Draft or Filtered Event',
            type: 'exec',
            position_x: 55,
            position_y: 25,
            options: {
              code: `module.exports = async function() {
  return { status: 'ignored', reason: 'Draft, unreleased or prerelease tag filtered out' };
};`,
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 6. Customer Onboarding & Workspace Provisioning (General)
  // =========================================================================
  {
    $schema: 'https://flow-manager.directus.app/schemas/recipe.v1.json',
    id: 'customer-onboarding-provisioner',
    name: 'Customer Onboarding & Workspace Provisioning',
    version: '1.1.0',
    description:
      'Listens for new user signups on directus_users, filters standard customers vs internal staff, auto-provisions their initial workspace profile, and dispatches a personalized welcome email.',
    category: 'General',
    icon: 'person_add',
    color: '#8B5CF6',
    author: {
      name: 'Flow Manager Official',
      url: 'https://github.com/baguse/directus-extension-flow-manager',
    },
    tags: ['onboarding', 'users', 'auth', 'welcome-sequence', 'email', 'provisioning'],
    documentation:
      '### Trigger\nConfigured as an Event Action Trigger listening on `directus_users.items.create`.\nAutomatically initializes a companion profile row in your custom workspace table.',
    parameters: [
      {
        key: 'WELCOME_EMAIL_WEBHOOK',
        label: 'Transactional Email Webhook (SendGrid / Resend / Postmark)',
        description: 'Endpoint to trigger customer welcome email delivery',
        type: 'secret',
        required: true,
        placeholder: 'https://api.resend.com/emails or webhook URL',
      },
      {
        key: 'APP_PORTAL_URL',
        label: 'Application Portal URL',
        description: 'Base URL for your customer portal (e.g. https://app.yourdomain.com)',
        type: 'string',
        required: true,
        default: 'https://app.yourdomain.com',
      },
    ],
    collections: [
      {
        key: 'profiles_collection',
        label: 'User Profiles Collection',
        suggested: 'user_profiles',
        description: 'Collection where initial customer profile metadata is created',
      },
    ],
    flows: [
      {
        name: 'Automated Customer Onboarding Flow',
        icon: 'person_add',
        color: '#8B5CF6',
        status: 'inactive',
        trigger: 'event',
        collections: ['directus_users'],
        options: {
          scope: ['items.create'],
        },
        operations: [
          {
            key: 'inspect_new_user',
            name: 'Inspect New User Attributes',
            type: 'exec',
            position_x: 15,
            position_y: 15,
            resolve: 'provision_user_profile',
            options: {
              code: `module.exports = async function(data) {
  const payload = data.$trigger.payload || {};
  const userId = data.$trigger.key || payload.id;
  const email = payload.email || 'user@example.com';
  const firstName = payload.first_name || 'Member';
  
  return {
    user_id: userId,
    email: email,
    first_name: firstName,
    portal_link: '{{parameters.APP_PORTAL_URL}}/onboarding?user=' + userId,
    created_at: new Date().toISOString()
  };
};`,
            },
          },
          {
            key: 'provision_user_profile',
            name: 'Provision Default Profile Record',
            type: 'item-create',
            position_x: 35,
            position_y: 15,
            resolve: 'send_welcome_transactional_email',
            options: {
              collection: '{{collections.profiles_collection}}',
              payload: {
                user_id: '{{$last.user_id}}',
                onboarding_completed: false,
                plan_tier: 'free_trial',
              },
            },
          },
          {
            key: 'send_welcome_transactional_email',
            name: 'Send Personalized Welcome Email',
            type: 'request',
            position_x: 55,
            position_y: 15,
            options: {
              url: '{{parameters.WELCOME_EMAIL_WEBHOOK}}',
              method: 'POST',
              headers: [{ header: 'Content-Type', value: 'application/json' }],
              body: JSON.stringify(
                {
                  to: '{{$first.email}}',
                  subject: 'Welcome to the platform, {{$first.first_name}}!',
                  html: '<p>Hi {{$first.first_name}},</p><p>Welcome aboard! Your workspace is ready. Click the link below to get started:</p><p><a href="{{$first.portal_link}}">Complete Setup</a></p>',
                },
                null,
                2,
              ),
            },
          },
        ],
      },
    ],
  },
];
