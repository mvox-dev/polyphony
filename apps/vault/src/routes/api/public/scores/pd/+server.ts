// Public API: Public Domain scores catalog
// GET /api/public/scores/pd
// No authentication required - used by Registry PD Catalog
// Returns all public_domain editions with work metadata

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

interface PDScoreRow {
  edition_id: string;
  edition_name: string;
  edition_arranger: string | null;
  edition_publisher: string | null;
  edition_voicing: string | null;
  edition_type: string;
  edition_notes: string | null;
  edition_external_url: string | null;
  work_id: string;
  work_title: string;
  work_composer: string | null;
  work_lyricist: string | null;
  org_id: string;
  org_name: string;
  org_subdomain: string;
}

export interface PDScore {
  editionId: string;
  editionName: string;
  arranger: string | null;
  publisher: string | null;
  voicing: string | null;
  editionType: string;
  notes: string | null;
  externalUrl: string | null;
  work: {
    id: string;
    title: string;
    composer: string | null;
    lyricist: string | null;
  };
  organization: {
    id: string;
    name: string;
    subdomain: string;
  };
}

/**
 * Transform database row to PDScore format
 */
function transformPDScoreRow(row: PDScoreRow): PDScore {
  return {
    editionId: row.edition_id,
    editionName: row.edition_name,
    arranger: row.edition_arranger,
    publisher: row.edition_publisher,
    voicing: row.edition_voicing,
    editionType: row.edition_type,
    notes: row.edition_notes,
    externalUrl: row.edition_external_url,
    work: {
      id: row.work_id,
      title: row.work_title,
      composer: row.work_composer,
      lyricist: row.work_lyricist,
    },
    organization: {
      id: row.org_id,
      name: row.org_name,
      subdomain: row.org_subdomain,
    },
  };
}

/**
 * GET /api/public/scores/pd
 * Returns all public domain scores across all organizations
 */
export const GET: RequestHandler = async ({ platform }) => {
  if (!platform?.env?.DB) {
    throw error(500, "Database not available");
  }

  const { results } = await platform.env.DB.prepare(
    `
			SELECT 
				e.id as edition_id,
				e.name as edition_name,
				e.arranger as edition_arranger,
				e.publisher as edition_publisher,
				e.voicing as edition_voicing,
				e.edition_type,
				e.notes as edition_notes,
				e.external_url as edition_external_url,
				w.id as work_id,
				w.title as work_title,
				w.composer as work_composer,
				w.lyricist as work_lyricist,
				o.id as org_id,
				o.name as org_name,
				o.subdomain as org_subdomain
			FROM editions e
			JOIN works w ON e.work_id = w.id
			JOIN organizations o ON w.org_id = o.id
			WHERE e.license_type = 'public_domain'
			ORDER BY w.title ASC, e.name ASC
		`,
  ).all<PDScoreRow>();

  const scores = results.map(transformPDScoreRow);

  return json({ scores });
};
