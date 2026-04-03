import type { PageServerLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { getGuideBySlug } from "$lib/content/guides";
import { marked } from "marked";
import { getLocale } from "$lib/paraglide/runtime.js";

export const load: PageServerLoad = async ({ params }) => {
  const guide = getGuideBySlug(params.slug);

  if (!guide) {
    throw error(404, "Guide not found");
  }

  // Get content in user's locale, fall back to Estonian, then English
  const locale = getLocale();
  const markdown =
    guide.content[locale] ?? guide.content["et"] ?? guide.content["en"];
  if (!markdown) {
    throw error(404, "Guide content not available");
  }

  // Render markdown to HTML
  const html = await marked(markdown, {
    gfm: true,
    breaks: false,
  });

  return {
    guide,
    html,
  };
};
