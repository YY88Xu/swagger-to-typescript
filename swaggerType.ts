export interface Tags{
  name: string;
  description: string;
}

export interface ParamsInfo{
  name: string;
  in: 'query' | 'path' | 'body';
  description: string;
  required: boolean;
  type: string;
  schema: IntegratedType;
}

export interface IntegratedType{
  $ref?: string;   
  type?: string;   
  items?: {
    $ref: string;
  }
}

export interface NormalRes{
  description: string;
  schema: IntegratedType
}

export interface MethodItem{
  tags: string[];
  summary: string;
  description: string;
  parameters: ParamsInfo[]
  responses: {
    "200": NormalRes
  }
}

export interface PathItem{
  [method: string]: MethodItem
}

export interface Paths{
  [path: string]: PathItem
}

export interface VoProp{
  type: string;
  description: string;
  items?: IntegratedType;
  $ref?: string;
}

export interface Vo{
  type: string;
  properties: {
    [prop: string]: VoProp
  }
}

export interface DftItem{
  [vo: string]: Vo
}

export interface SwaggerDocType{
  swagger: string;
  basePath: string;
  tags: Tags[];
  paths: Paths;
  definitions: DftItem
}

export interface ConvertItem{
  name: string;
  type?: string;
  required: boolean;
}

export interface GlobalFileTag extends Tags{
  serviceStr: string;
  importType: string[];
}
