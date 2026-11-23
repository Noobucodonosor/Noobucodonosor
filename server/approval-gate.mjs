import { SmartphoneApprovalGate as GatewayApprovalGate } from '../packages/ai-gateway/src/approval-gate.mjs';

export class SmartphoneApprovalGate extends GatewayApprovalGate {
  constructor(options = {}) {
    super({
      brandName: options.brandName ?? 'Noobucodonosor',
      ...options,
    });
  }
}
