/**
 * Binary data decoder for Olympus units and weapons endpoints.
 * 
 * Per spec: Olympus returns units and weapons data in binary format for efficiency.
 * This decoder will port the existing DataExtractor implementation from
 * the Olympus client code to decode this binary data into normalized structures.
 * 
 * BFIS will implement binary decoding for units/weapons using the same format
 * Olympus already uses (porting the existing DataExtractor implementation from
 * the Olympus client code), instead of requesting new JSON endpoints.
 * 
 * TODO: Port DataExtractor from frontend/server or frontend/react codebase.
 * The binary format is already defined in Olympus; we need to implement
 * the same decoding logic here.
 */
