export interface ClickUpHistoryItem {
  field?: string;
  before?: unknown;
  after?: unknown;
  custom_field?: {
    id?: string;
    name?: string;
  };
}

export interface ClickUpCustomField {
  id?: string;
  name?: string;
  type?: string;
  value?: unknown;
  type_config?: {
    options?: Array<{
      id?: string;
      name?: string;
      orderindex?: number | string;
    }>;
  };
}

export interface ClickUpLinkedTask {
  task_id?: string;
  link_id?: string;
}

export interface ClickUpTask {
  id?: string;
  name?: string;
  parent?: string | null;
  custom_fields?: ClickUpCustomField[];
  linked_tasks?: ClickUpLinkedTask[];
  subtasks?: ClickUpTask[];
  description?: string;
  markdown_description?: string;
}

export interface ClickUpAutomationTaskPayload {
  id?: string;
  name?: string;
}

export interface ClickUpWebhookPayload {
  challenge?: string;
  event?: string;
  task_id?: string;
  webhook_id?: string;
  auto_id?: string;
  trigger_id?: string;
  date?: string;
  payload?: ClickUpAutomationTaskPayload;
  task?: ClickUpAutomationTaskPayload;
  history_items?: ClickUpHistoryItem[];
}

export interface Env {
  CLICKUP_API_KEY: string;
  CLICKUP_NOTES_FIELD_ID?: string;

  // Menu Recipes list fields
  RECIPE_COST_FIELD_ID?: string;
  TARGET_POUR_COST_FIELD_ID?: string;
  TARGET_COST_FIELD_ID?: string;
  SUGGESTED_PRICE_FIELD_ID?: string;

  // Ingredient (subtask) fields
  INGREDIENT_COST_FIELD_ID?: string;
  INGREDIENT_LINE_TOTAL_FIELD_ID?: string;
  INGREDIENT_LINE_EXT_COST_FIELD_ID?: string;
  INGREDIENT_QTY_FIELD_ID?: string;
  INGREDIENT_UNIT_FIELD_ID?: string;
  INGREDIENT_UNIT_COST_FIELD_ID?: string;
  INGREDIENT_STOCK_FIELD_ID?: string;

  // Stock list fields
  STOCK_MENU_ITEMS_FIELD_ID?: string;
  STOCK_COST_FIELD_ID?: string;           // Purchase price for order_qty units
  STOCK_UNIT_AMOUNT_FIELD_ID?: string;    // ml/bottle for ml; pieces/kg for kg
  STOCK_ORDER_QTY_FIELD_ID?: string;      // Units per purchase order (default 1)
  STOCK_UNIT_FIELD_ID?: string;           // ml | each | kg
  STOCK_INITIAL_QTY_FIELD_ID?: string;    // Units on hand (for inventory)

  // Unit conversion constants
  DASH_ML?: string;
  BAR_SPOON_ML?: string;
  CL_ML?: string;
}

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}
