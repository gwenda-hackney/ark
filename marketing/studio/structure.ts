import type { StructureResolver } from "sanity/structure";
import { orderableDocumentListDeskItem } from "@sanity/orderable-document-list";

const HIDDEN_FROM_LIST = new Set([
  "menuSection",
  "menuItem",
  "siteSettings",
  "form",
]);

export const structure: StructureResolver = async (S, context) => {
  const client = context.getClient({ apiVersion: "2025-01-01" });
  const sections = await client.fetch<
    Array<{ _id: string; title: string; slug: string | null }>
  >(
    `*[_type == "menuSection" && !(_id in path("drafts.**"))] | order(orderRank asc) {
      _id,
      title,
      "slug": slug.current
    }`,
  );

  return S.list()
    .title("Content")
    .items([
      S.listItem()
        .title("Site settings")
        .id("site-settings")
        .child(
          S.document()
            .schemaType("siteSettings")
            .documentId("siteSettings")
            .title("Site settings"),
        ),
      S.divider(),
      orderableDocumentListDeskItem({
        type: "menuSection",
        title: "Menu sections",
        S,
        context,
      }),
      S.divider(),
      ...sections.map((section) =>
        orderableDocumentListDeskItem({
          type: "menuItem",
          id: `orderable-menu-items-${section.slug ?? section._id}`,
          title: section.title,
          filter: `section._ref == $sectionId`,
          params: { sectionId: section._id },
          S,
          context,
        }),
      ),
      S.divider(),
      S.listItem()
        .title("Forms")
        .id("forms")
        .child(S.documentTypeList("form").title("Forms")),
      S.divider(),
      ...S.documentTypeListItems().filter(
        (item) => !HIDDEN_FROM_LIST.has(item.getId() ?? ""),
      ),
    ]);
};
