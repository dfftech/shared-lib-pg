import { describe, expect, it } from "bun:test";
import { AddressMapper } from "../src/modules/address/address.mapper.ts";

describe("AddressMapper", () => {
  it("converts camelCase DTO values to entity columns and back to the reply view", () => {
    const values = AddressMapper.FromDto({ address: "123 Main Street", type: "billing", zipCode: "90210" });
    const entity = AddressMapper.ToEntity(values, undefined, "user-1");
    const view = AddressMapper.ToView(entity);

    expect(entity.id).toBe(values.id);
    expect(entity.zipcode).toBe("90210");
    expect(view.id).toBe(values.id);
    expect(view.zipCode).toBe("90210");
    expect(view.createdAt).toBe(entity.created_at.toISOString());
    expect(view.updatedAt).toBe(entity.updated_at.toISOString());
    expect(view.createdBy).toBe("user-1");
    expect(view.updatedBy).toBe("user-1");
  });
});
