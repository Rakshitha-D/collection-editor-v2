export interface ITerm {
  identifier: string;
  name: string;
  code: string;
  index?: number;
  /** Framework category this term belongs to (e.g. 'board', 'medium').
   *  Association entries carry this so a parent term's associations can be
   *  filtered down to a single child category — mirrors Angular's
   *  `a.category === field.sourceCategory` filter. */
  category?: string;
  status?: string;
  description?: string;
  associations?: ITerm[];
}

export interface ICategory {
  identifier: string;
  name: string;
  code: string;
  /** Category order within the framework — the LP editor resolves the
   *  skill-equivalent category as the one with the highest index (USF's
   *  `skill` category also has the highest index, so one rule covers both). */
  index?: number;
  terms?: ITerm[];
}

export interface IFramework {
  identifier: string;
  name: string;
  code: string;
  categories?: ICategory[];
}

export interface IFrameworkDetails {
  organisationFramework?: IFramework;
  targetFrameworks?: IFramework[];
  /** Options for the 'framework' (Course Type) field — built from channel.frameworks
   *  filtered/extended by orgFWType from the category definition. */
  orgFrameworks?: Array<{ label: string; value: string }>;
  /** Options for the 'additionalCategories' field — from channel.collectionAdditionalCategories. */
  channelAdditionalCategories?: string[];
}
