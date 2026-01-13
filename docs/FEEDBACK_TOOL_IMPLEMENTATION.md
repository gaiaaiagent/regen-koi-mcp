# Feedback Tool Implementation Plan

> Add `submit_feedback` tool to KOI MCP for in-session feedback collection

---

## 1. Tool Definition (regen-koi-mcp/src/tools.ts)

Add to the `TOOLS` array:

```typescript
{
  name: 'submit_feedback',
  description: `Submit feedback about your experience using KOI MCP tools.

Use this after completing a task to share:
- Whether it worked well or had issues
- Suggestions for improvement
- Bugs or unexpected behavior

Your feedback helps improve the system. All feedback is stored anonymously with session context.

Example usage:
  submit_feedback(rating=5, category="success", notes="Found exactly what I needed about basket tokens")
  submit_feedback(rating=2, category="bug", notes="search returned no results for 'Registry Agent'")`,
  inputSchema: {
    type: 'object',
    properties: {
      rating: {
        type: 'number',
        minimum: 1,
        maximum: 5,
        description: 'Rating from 1 (poor) to 5 (excellent)'
      },
      category: {
        type: 'string',
        enum: ['success', 'partial', 'bug', 'suggestion', 'question', 'other'],
        description: 'Type of feedback: success (worked great), partial (mostly worked), bug (something broke), suggestion (feature idea), question (need help), other'
      },
      task_description: {
        type: 'string',
        description: 'Brief description of what you were trying to do (optional but helpful)'
      },
      notes: {
        type: 'string',
        description: 'Detailed feedback, observations, or suggestions'
      },
      include_session_context: {
        type: 'boolean',
        description: 'Include recent tool calls for debugging context (default: true)',
        default: true
      }
    },
    required: ['rating', 'category', 'notes']
  }
}
```

---

## 2. Handler Implementation (regen-koi-mcp/src/index.ts)

Add to the switch statement in `handleToolCall`:

```typescript
case 'submit_feedback':
  result = await this.submitFeedback(args);
  break;
```

Add the method to the KoiMcpServer class:

```typescript
/**
 * Submit user feedback about their KOI MCP experience
 */
private async submitFeedback(args: {
  rating: number;
  category: string;
  task_description?: string;
  notes: string;
  include_session_context?: boolean;
}): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { rating, category, task_description, notes, include_session_context = true } = args;

  // Collect session context if requested
  let sessionContext: Record<string, any> = {};
  if (include_session_context) {
    sessionContext = {
      recent_tools: getMetricsSummary().recentQueries?.slice(-10) || [],
      session_start: getMetricsSummary().startTime,
      total_queries: getMetricsSummary().totalQueries,
      error_count: getMetricsSummary().errorCount,
    };
  }

  const feedbackPayload = {
    rating,
    category,
    task_description: task_description || null,
    notes,
    session_context: sessionContext,
    user_email: USER_EMAIL || 'anonymous',
    client_version: SERVER_VERSION,
    timestamp: new Date().toISOString(),
  };

  try {
    const response = await apiClient.post('/feedback', feedbackPayload);

    logger.info({
      action: 'feedback_submitted',
      rating,
      category,
      feedback_id: response.data?.id
    }, 'User feedback submitted');

    return {
      content: [{
        type: 'text',
        text: `✓ Thank you for your feedback!

**Rating:** ${rating}/5
**Category:** ${category}
**Feedback ID:** ${response.data?.id || 'recorded'}

Your feedback helps improve KOI for everyone. ${
  category === 'bug'
    ? '\n\nFor urgent bugs, also consider posting in the Gaia AI Slack channel.'
    : ''
}`
      }]
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ action: 'feedback_submit_error', error: errorMessage }, 'Failed to submit feedback');

    // Still acknowledge the feedback even if storage fails
    return {
      content: [{
        type: 'text',
        text: `Thank you for your feedback. (Note: There was an issue storing it - ${errorMessage}. Consider posting in Slack if urgent.)`
      }]
    };
  }
}
```

---

## 3. Validation Schema (regen-koi-mcp/src/validation.ts)

Add to the validation schemas:

```typescript
submit_feedback: z.object({
  rating: z.number().min(1).max(5),
  category: z.enum(['success', 'partial', 'bug', 'suggestion', 'question', 'other']),
  task_description: z.string().optional(),
  notes: z.string().min(1).max(5000),
  include_session_context: z.boolean().optional().default(true),
}),
```

---

## 4. Backend API Endpoint (koi-processor)

Add to the KOI API routes:

### Route: `POST /api/koi/feedback`

```typescript
// In koi-processor/src/routes/feedback.ts

import { Router } from 'express';
import { pool } from '../db';

const router = Router();

interface FeedbackPayload {
  rating: number;
  category: string;
  task_description?: string;
  notes: string;
  session_context?: Record<string, any>;
  user_email?: string;
  client_version?: string;
  timestamp?: string;
}

router.post('/', async (req, res) => {
  const feedback: FeedbackPayload = req.body;

  // Validate required fields
  if (!feedback.rating || !feedback.category || !feedback.notes) {
    return res.status(400).json({ error: 'Missing required fields: rating, category, notes' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO user_feedback
       (rating, category, task_description, notes, session_context, user_email, client_version, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        feedback.rating,
        feedback.category,
        feedback.task_description || null,
        feedback.notes,
        JSON.stringify(feedback.session_context || {}),
        feedback.user_email || 'anonymous',
        feedback.client_version || 'unknown',
        feedback.timestamp || new Date().toISOString(),
      ]
    );

    res.json({
      success: true,
      id: result.rows[0].id,
      message: 'Feedback recorded'
    });
  } catch (error) {
    console.error('Failed to store feedback:', error);
    res.status(500).json({ error: 'Failed to store feedback' });
  }
});

// GET endpoint for retrieving feedback (admin/internal use)
router.get('/', async (req, res) => {
  const { limit = 50, category, since } = req.query;

  try {
    let query = 'SELECT * FROM user_feedback';
    const params: any[] = [];
    const conditions: string[] = [];

    if (category) {
      conditions.push(`category = $${params.length + 1}`);
      params.push(category);
    }

    if (since) {
      conditions.push(`created_at >= $${params.length + 1}`);
      params.push(since);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);
    res.json({ feedback: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('Failed to retrieve feedback:', error);
    res.status(500).json({ error: 'Failed to retrieve feedback' });
  }
});

export default router;
```

---

## 5. Database Schema

```sql
-- Add to koi-processor database migrations

CREATE TABLE IF NOT EXISTS user_feedback (
  id SERIAL PRIMARY KEY,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  category VARCHAR(50) NOT NULL,
  task_description TEXT,
  notes TEXT NOT NULL,
  session_context JSONB DEFAULT '{}',
  user_email VARCHAR(255) DEFAULT 'anonymous',
  client_version VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Indexes for common queries
  CONSTRAINT valid_category CHECK (category IN ('success', 'partial', 'bug', 'suggestion', 'question', 'other'))
);

CREATE INDEX idx_feedback_created_at ON user_feedback(created_at DESC);
CREATE INDEX idx_feedback_category ON user_feedback(category);
CREATE INDEX idx_feedback_rating ON user_feedback(rating);

-- View for quick summary
CREATE OR REPLACE VIEW feedback_summary AS
SELECT
  category,
  COUNT(*) as count,
  ROUND(AVG(rating), 2) as avg_rating,
  MAX(created_at) as latest
FROM user_feedback
GROUP BY category
ORDER BY count DESC;
```

---

## 6. Update Quick Start Guide

Add to `docs/team-quick-start.md`:

```markdown
## 6. Share Feedback

After testing, share your experience:

```
Submit feedback: I tried searching for Registry Agent and it worked great. Rating 5.
```

Or if something didn't work:

```
Submit feedback: The search for "basket tokens" returned no results. Rating 2, category bug.
```

Your feedback is stored and helps improve the system.
```

---

## 7. Metrics Dashboard Query

For engineering review, query feedback:

```sql
-- Weekly feedback summary
SELECT
  DATE_TRUNC('week', created_at) as week,
  category,
  COUNT(*) as count,
  ROUND(AVG(rating), 2) as avg_rating
FROM user_feedback
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY week, category
ORDER BY week DESC, count DESC;

-- Recent bugs
SELECT * FROM user_feedback
WHERE category = 'bug'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- Low-rated sessions with context
SELECT
  id, rating, category, notes,
  session_context->'recent_tools' as tools_used,
  created_at
FROM user_feedback
WHERE rating <= 2
ORDER BY created_at DESC
LIMIT 20;
```

---

## Implementation Order

1. **Database** - Create table in koi-processor DB
2. **Backend API** - Add `/feedback` endpoint to koi-processor
3. **MCP Tool** - Add tool definition + handler to regen-koi-mcp
4. **Test** - Verify end-to-end flow
5. **Document** - Update quick-start guide
6. **Deploy** - Publish new MCP version

---

## Future Enhancements

- **Weekly digest** - Automated email/Slack summary of feedback
- **Correlation with CI** - Link feedback to specific tool versions
- **Sentiment analysis** - Auto-categorize free-text feedback
- **In-context prompting** - Agent occasionally asks for feedback after complex tasks (opt-in)
