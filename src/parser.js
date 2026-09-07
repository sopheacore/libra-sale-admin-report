import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(customParseFormat);

/**
 * Normalize Service Category
 */
export function normalizeCategory(categoryStr) {
  if (!categoryStr) return 'Other';
  const clean = categoryStr.trim().toLowerCase();

  if (/manned|guard|security\s*guard|physical/i.test(clean)) {
    return 'Manned Security';
  }
  if (/cms|alarm|911|cctv|camera|installation|product/i.test(clean)) {
    return 'CMS';
  }
  if (/other/i.test(clean)) {
    return 'Other';
  }

  // Capitalize properly if custom
  return categoryStr.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Normalize Status
 */
export function normalizeStatus(statusStr) {
  if (!statusStr) return null;
  const clean = statusStr.trim().toLowerCase();

  if (/new(\s*start)?|start|deal|won/i.test(clean)) {
    return 'New Start';
  }
  if (/extra|upsell|add(ition)?|expansion/i.test(clean)) {
    return 'Extra';
  }
  if (/reduct(ion)?|downsize|decrease|cut/i.test(clean)) {
    return 'Reduction';
  }
  if (/terminat(e|ion)|cancel(led)?|lost|stop|ended/i.test(clean)) {
    return 'Terminate';
  }

  return null;
}

/**
 * Parse numeric amount from string like "$1,200.00", "1200$", "1200.50 USD", "Amout: 1200"
 */
export function parseAmount(amountStr) {
  if (typeof amountStr === 'number') return amountStr;
  if (!amountStr) return null;

  // Extract first floating-point or integer number with optional decimals and commas
  const match = String(amountStr).match(/[\d,]+(?:\.\d+)?/);
  if (!match) return null;

  const cleanStr = match[0].replace(/,/g, '');
  const num = parseFloat(cleanStr);
  return isNaN(num) ? null : Math.abs(num);
}

/**
 * Extract Date if present in message (supports 01/Sep/2026, 01-Sep-2026, 01 Sep 2026, 2026-09-01, 01/09/2026, etc.)
 */
export function extractDate(text) {
  if (!text) return dayjs().format('YYYY-MM-DD');

  // 1. Match DD/MMM/YYYY or DD-MMM-YYYY or DD MMM YYYY (e.g., 01/Sep/2026, 1-September-2026, 05 Oct 2026)
  const dMmmYMatch = text.match(/\b([0-2]?\d|3[01])[-/\s.](Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[-/\s.](20\d\d)\b/i);
  if (dMmmYMatch) {
    const day = dMmmYMatch[1].padStart(2, '0');
    const monthStr = dMmmYMatch[2];
    const year = dMmmYMatch[3];
    const parsed = dayjs(`${day} ${monthStr} ${year}`, ['DD MMM YYYY', 'DD MMMM YYYY', 'D MMM YYYY', 'D MMMM YYYY']);
    if (parsed.isValid()) {
      return parsed.format('YYYY-MM-DD');
    }
  }

  // 2. Match MMM/DD/YYYY or MMM-DD-YYYY or MMM DD YYYY (e.g., Sep 01, 2026)
  const mmmDYMatch = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[-/\s.]([0-2]?\d|3[01])(?:st|nd|rd|th)?,?[-/\s.](20\d\d)\b/i);
  if (mmmDYMatch) {
    const monthStr = mmmDYMatch[1];
    const day = mmmDYMatch[2].padStart(2, '0');
    const year = mmmDYMatch[3];
    const parsed = dayjs(`${day} ${monthStr} ${year}`, ['DD MMM YYYY', 'DD MMMM YYYY']);
    if (parsed.isValid()) {
      return parsed.format('YYYY-MM-DD');
    }
  }

  // 3. Match YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = text.match(/\b(20\d\d[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01]))\b/);
  if (isoMatch) {
    return dayjs(isoMatch[1].replace(/\//g, '-')).format('YYYY-MM-DD');
  }

  // 4. Match DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = text.match(/\b((0[1-9]|[12]\d|3[01])[-/.](0[1-9]|1[0-2])[-/.](20\d\d))\b/);
  if (dmyMatch) {
    const parts = dmyMatch[1].split(/[-/.]/);
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }

  // Default to today
  return dayjs().format('YYYY-MM-DD');
}

/**
 * Parse a key-value or shorthand line (e.g. pipe delimited)
 */
function parseInlineSegments(line, defaultDate) {
  if (line.includes('|') || line.includes(';')) {
    const segments = line.split(/[|;]/).map(s => s.trim()).filter(Boolean);
    
    let saleRep = null;
    let category = null;
    let status = null;
    let amount = null;
    let clientName = null;
    let notes = null;

    for (const seg of segments) {
      // Check Sale ID
      const repM = seg.match(/(?:(?:^\d+[\.\)]\s*)?(?:sale\s*(?:id|rep|person|name)?|saler)\s*[:=-]\s*)(.+)/i);
      if (repM) {
        saleRep = repM[1].trim();
        continue;
      }
      
      // Check Service
      const catM = seg.match(/(?:service(?:\s*catego(?:ry)?)?|catego(?:ry)?)\s*[:=-]\s*(.+)/i);
      if (catM) {
        category = normalizeCategory(catM[1]);
        continue;
      }

      // Check Status
      const statM = seg.match(/(?:status|type)\s*[:=-]\s*(.+)/i);
      if (statM) {
        status = normalizeStatus(statM[1]);
        continue;
      }

      // Check Amount (supports 'Amount', 'Amout', 'Amt', 'Price', 'Value', etc.)
      const amtM = seg.match(/(?:amou?n?t|ammou?n?t|price|value|fee|amt|total|\$)\s*[:=-]\s*(.+)/i);
      if (amtM) {
        amount = parseAmount(amtM[1]);
        continue;
      }

      // Check Client
      const cliM = seg.match(/(?:client(?:\s*name)?|customer|company)\s*[:=-]\s*(.+)/i);
      if (cliM) {
        clientName = cliM[1].trim();
        continue;
      }

      // Direct value heuristics if no key prefix
      if (!status && normalizeStatus(seg)) {
        status = normalizeStatus(seg);
        continue;
      }
      if (!amount && parseAmount(seg) !== null && /[\$\d]/.test(seg)) {
        amount = parseAmount(seg);
        continue;
      }
      if (!saleRep && /^(?:(?:^\d+[\.\)]\s*)?mr\.?\s*\w+|saler\s*\w+|\w+\s*\d+)$/i.test(seg)) {
        saleRep = seg.replace(/^\d+[\.\)]\s*/, '').trim();
        continue;
      }
      if (!category && /manned|guard|cms|alarm|other/i.test(seg)) {
        category = normalizeCategory(seg);
        continue;
      }
    }

    if (saleRep && status && amount !== null) {
      return {
        report_date: defaultDate,
        sale_rep_code: saleRep,
        service_category: category || 'Manned Security',
        status: status,
        amount: amount,
        client_name: clientName,
        notes: notes,
        raw_text: line
      };
    }
  }

  return null;
}

/**
 * Parse a structured block of lines (e.g. multi-line key:value pairs)
 */
function parseBlock(blockText, defaultDate) {
  const lines = blockText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  // First check if this block is actually an inline delimited row
  if (lines.length === 1 && (lines[0].includes('|') || lines[0].includes(';'))) {
    return parseInlineSegments(lines[0], defaultDate);
  }

  let saleRep = null;
  let category = null;
  let status = null;
  let amount = null;
  let clientName = null;
  let notes = null;

  for (const line of lines) {
    // If a line inside the block is a pipe-delimited subline
    if (line.includes('|') || line.includes(';')) {
      const inlineObj = parseInlineSegments(line, defaultDate);
      if (inlineObj) return inlineObj;
    }

    // Check for Sale ID / Saler / Rep (supports "Sale ID : Mr. A1", ". Sale ID: Mr. A1", "Sale Rep - Mr. A1")
    const repMatch = line.match(/(?:^[•\-\*\.]?\s*(?:sale\s*(?:id|rep|person|name)?|saler)\s*[:=-]\s*)(.+)/i);
    if (repMatch) {
      saleRep = repMatch[1].trim();
      continue;
    }

    // Check for Service Category (e.g. "Service Catego: Manned Security", ".Service Catego: CMS")
    const catMatch = line.match(/(?:^[•\-\*\.]?\s*(?:service(?:\s*catego(?:ry)?)?|catego(?:ry)?)\s*[:=-]\s*)(.+)/i);
    if (catMatch) {
      category = normalizeCategory(catMatch[1]);
      continue;
    }

    // Check for Status (e.g. "Status: New Start", ".Status: Reduction")
    const statusMatch = line.match(/(?:^[•\-\*\.]?\s*(?:status|type)\s*[:=-]\s*)(.+)/i);
    if (statusMatch) {
      status = normalizeStatus(statusMatch[1]);
      continue;
    }

    // Check for Amount / Amout / Amt (e.g. "Amout: $1,200.00", ".Amout: $350.00")
    const amountMatch = line.match(/(?:^[•\-\*\.]?\s*(?:amou?n?t|ammou?n?t|price|value|fee|amt|total|\$)\s*[:=-]\s*)(.+)/i);
    if (amountMatch) {
      amount = parseAmount(amountMatch[1]);
      continue;
    }

    // Check for Client / Customer
    const clientMatch = line.match(/(?:^[•\-\*\.]?\s*(?:client(?:\s*name)?|customer|company)\s*[:=-]\s*)(.+)/i);
    if (clientMatch) {
      clientName = clientMatch[1].trim();
      continue;
    }

    // Check for explicit Date (e.g. "Date: 01/Sep/2026")
    const dateMatch = line.match(/(?:^[•\-\*\.]?\s*date\s*[:=-]\s*)(.+)/i);
    if (dateMatch) {
      defaultDate = extractDate(dateMatch[1]);
      continue;
    }

    // Check for Notes / Remarks
    const notesMatch = line.match(/(?:^[•\-\*\.]?\s*(?:notes?|remarks?|desc(?:ription)?)\s*[:=-]\s*)(.+)/i);
    if (notesMatch) {
      notes = notesMatch[1].trim();
      continue;
    }
  }

  // If core fields matched, return item
  if (saleRep && status && amount !== null) {
    return {
      report_date: defaultDate,
      sale_rep_code: saleRep,
      service_category: category || 'Manned Security',
      status: status,
      amount: amount,
      client_name: clientName,
      notes: notes,
      raw_text: blockText
    };
  }

  return null;
}

/**
 * Main Report Message Parser
 * Splits text into individual report blocks and parses each one.
 */
export function parseReportMessage(text, meta = {}) {
  if (!text || typeof text !== 'string') return [];

  const defaultDate = extractDate(text);
  const items = [];

  // 1. Check if entire text is composed of pipe lines
  const allLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let parsedFromLines = 0;
  
  for (const line of allLines) {
    if (line.includes('|') || line.includes(';')) {
      const item = parseInlineSegments(line, defaultDate);
      if (item) {
        if (meta.reported_by) item.reported_by = meta.reported_by;
        if (meta.telegram_message_id) item.telegram_message_id = meta.telegram_message_id;
        items.push(item);
        parsedFromLines++;
      }
    }
  }

  if (items.length > 0 && parsedFromLines === items.length) {
    return items;
  }

  // 2. Partition by Sale ID headers or blank lines
  const normalizedText = text
    .replace(/(?:\r?\n)(?=(?:[•\-\*\.]?\s*(?:sale\s*(?:id|rep|name)?|saler)\s*[:=-]|\d+[\.\)]\s*(?:sale|mr)))/gi, '\n===BLOCK===\n');

  const blocks = normalizedText.split(/(?:\r?\n\s*\r?\n|===BLOCK===|---+|___+)/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Check if block itself has pipe items
    if (trimmed.includes('|') || trimmed.includes(';')) {
      const lineItems = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lineItems) {
        const item = parseInlineSegments(line, defaultDate);
        if (item) {
          if (meta.reported_by) item.reported_by = meta.reported_by;
          if (meta.telegram_message_id) item.telegram_message_id = meta.telegram_message_id;
          items.push(item);
        }
      }
    } else {
      const item = parseBlock(trimmed, defaultDate);
      if (item) {
        if (meta.reported_by) item.reported_by = meta.reported_by;
        if (meta.telegram_message_id) item.telegram_message_id = meta.telegram_message_id;
        items.push(item);
      }
    }
  }

  // 3. Fallback: single block parse
  if (items.length === 0) {
    const single = parseBlock(text, defaultDate);
    if (single) {
      if (meta.reported_by) single.reported_by = meta.reported_by;
      if (meta.telegram_message_id) single.telegram_message_id = meta.telegram_message_id;
      items.push(single);
    }
  }

  return items;
}
