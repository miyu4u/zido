declare const opaqueBrand: unique symbol

export type Opaque<Value, Brand extends string> = Value & {
  readonly [opaqueBrand]: Brand
}

export type ID<Brand extends string> = Opaque<string, Brand>
