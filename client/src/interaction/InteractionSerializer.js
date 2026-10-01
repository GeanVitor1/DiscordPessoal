/**
 * Serializes and deserializes interaction events with structural validation.
 */
export class InteractionSerializer {
  /**
   * Serialize event object to JSON string or binary (Uint8Array)
   * @param {object} event 
   * @param {'json'|'binary'} format 
   * @returns {string|Uint8Array}
   */
  static serialize(event, format = 'json') {
    if (!event || typeof event !== 'object') {
      throw new Error('Event must be an object');
    }
    const jsonStr = JSON.stringify(event);
    if (format === 'binary') {
      const encoder = new TextEncoder();
      return encoder.encode(jsonStr);
    }
    return jsonStr;
  }

  /**
   * Deserialize raw payload (string, ArrayBuffer, or Uint8Array) into an event object
   * @param {string|ArrayBuffer|Uint8Array} rawData 
   * @returns {object}
   */
  static deserialize(rawData) {
    if (!rawData) {
      throw new Error('Raw data is null or undefined');
    }

    let jsonStr;
    if (typeof rawData === 'string') {
      jsonStr = rawData;
    } else if (rawData instanceof ArrayBuffer || ArrayBuffer.isView(rawData)) {
      const decoder = new TextDecoder();
      jsonStr = decoder.decode(rawData);
    } else {
      throw new Error('Unsupported raw data format');
    }

    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Deserialized result is not an object');
      }
      return parsed;
    } catch (err) {
      throw new Error(`Serialization error: Failed to parse event JSON - ${err.message}`);
    }
  }
}
