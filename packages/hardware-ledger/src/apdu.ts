import {
	BIP32PathComponentT,
	HDPathRadixT,
	PublicKeyT,
	RADIX_COIN_TYPE,
} from '@radixdlt/crypto'
import { NetworkT } from '@radixdlt/primitives'
import {
	LedgerInstruction,
	LedgerResponseCodes,
	PartialAPDUT,
	RadixAPDUT,
	radixCLA,
} from './_types'

// ##### Follows https://github.com/radixdlt/radixdlt-ledger-app/blob/main/APDUSPEC.md #####

const hdPathComponentsToBuffer = (hdPath: HDPathRadixT): Buffer => {
	if (
		hdPath.coinType.value() !== RADIX_COIN_TYPE ||
		!hdPath.coinType.isHardened
	) {
		throw new Error(`Expected coinType to be ${RADIX_COIN_TYPE}'`)
	}

	const bytesPerComponent = 4
	const data = Buffer.alloc(bytesPerComponent * hdPath.pathComponents.length)

	const write = (
		pathComponent: BIP32PathComponentT,
		offset: number,
	): void => {
		data.writeUInt32BE(pathComponent.index, offset)
	}

	hdPath.pathComponents.forEach((component, index) => {
		write(component, index * bytesPerComponent)
	})

	return data
}

const hdPathToBuffer = (hdPath: HDPathRadixT): Buffer => {
	const bipPathsData = hdPathComponentsToBuffer(hdPath)
	const bipPathsLength = hdPath.pathComponents.length
	const bipPathsLengthAsSingleByte = Buffer.alloc(1)
	bipPathsLengthAsSingleByte.writeUInt8(bipPathsLength)
	return Buffer.concat([bipPathsLengthAsSingleByte, bipPathsData])
}

const makeAPDU = (input: Omit<PartialAPDUT, 'cla'>): RadixAPDUT => ({
	cla: radixCLA,
	ins: input.ins,
	p1: input.p1 ?? 0,
	p2: input.p2 ?? 0,
	data: input.data,
	requiredResponseStatusCodeFromDevice: input.requiredResponseStatusCodeFromDevice ?? [
		LedgerResponseCodes.SW_OK,
	],
})

const getVersion = (): RadixAPDUT =>
	makeAPDU({
		ins: LedgerInstruction.GET_VERSION,
	})

type WithPath = Readonly<{
	path: HDPathRadixT
}>

type APDUGetPublicKeyInput = WithPath &
	Readonly<{
		displayAddress: boolean
		// verifyAddressOnDeviceForNetwork?: NetworkT
	}>

const parameterValueForDisplayAddressOnLedger = (
	input: APDUGetPublicKeyInput,
): number => (input.displayAddress ? 0x01 : 0x00)

const parameterValueForDisplayECDHInputOnLedger = (
	input: APDUDoKeyExchangeInput,
): number => (input.displayBIPAndPubKeyOtherParty ? 0x01 : 0x00)

const getPublicKey = (input: APDUGetPublicKeyInput): RadixAPDUT => {
	// const p1: number = input.requireConfirmationOnDevice ? 0x01 : 0x00
	// const p1: number =
	// 	input.verifyAddressOnDeviceForNetwork !== undefined
	// 		? input.verifyAddressOnDeviceForNetwork === NetworkT.MAINNET
	// 			? 0x01
	// 			: 0x02
	// 		: 0x00

	const p1 = parameterValueForDisplayAddressOnLedger(input)

	const data = hdPathToBuffer(input.path)

	return makeAPDU({
		ins: LedgerInstruction.GET_PUBLIC_KEY,
		p1,
		data,
	})
}

type APDUDoKeyExchangeInput = WithPath &
	Readonly<{
		publicKeyOfOtherParty: PublicKeyT
		displayBIPAndPubKeyOtherParty: boolean
	}>

const doKeyExchange = (input: APDUDoKeyExchangeInput): RadixAPDUT => {
	const p1 = parameterValueForDisplayECDHInputOnLedger(input)

	const publicKeyUncompressedData = input.publicKeyOfOtherParty.asData({
		compressed: false,
	})
	const publicKeyLengthBuf = Buffer.alloc(1)
	publicKeyLengthBuf.writeUInt8(publicKeyUncompressedData.length)

	const publicKeyData = Buffer.concat([
		publicKeyLengthBuf,
		publicKeyUncompressedData,
	])

	const pathData = hdPathToBuffer(input.path)

	const data = Buffer.concat([pathData, publicKeyData])

	return makeAPDU({
		ins: LedgerInstruction.DO_KEY_EXCHANGE,
		p1,
		data,
	})
}

type APDUDoSignHashInput = APDUGetPublicKeyInput &
	Readonly<{
		hashToSign: Buffer
	}>

const doSignHash = (input: APDUDoSignHashInput): RadixAPDUT => {
	const p1 = parameterValueForDisplayAddressOnLedger(input)

	const pathData = hdPathToBuffer(input.path)
	const hashLenBuf = Buffer.alloc(1)
	const hashedMessageByteCount = input.hashToSign.length
	hashLenBuf.writeUInt8(hashedMessageByteCount)
	const hashData = Buffer.concat([hashLenBuf, input.hashToSign])

	const data = Buffer.concat([pathData, hashData])

	return makeAPDU({
		ins: LedgerInstruction.DO_SIGN_HASH,
		p1,
		data,
	})
}

type APDUDoSignTxInitialPackage = WithPath &
	Readonly<{
		txByteCount: number
		nonNativeTokenRriHRP?: string
		numberOfInstructions: number
	}>

type APDUDoSignTxSingleInstructionPackage = Readonly<{
	instructionBytes: Buffer
	isLastInstruction: boolean
}>

enum SignTxAPDUType {
	SINGLE_RADIX_ENGINE_INSTRUCTION_APDU = 73, // Ascii code for 'I' as in "Instruction",
	FIRST_METADATA_APDU = 77, // Ascii code for 'M', as in "Metadata"
}

const signTxInitialSetupPackage = (
	input: APDUDoSignTxInitialPackage,
): RadixAPDUT => {
	const p1 = SignTxAPDUType.FIRST_METADATA_APDU.valueOf()

	const pathData = hdPathToBuffer(input.path)
	const sizeOfTXAsData = Buffer.alloc(4)
	sizeOfTXAsData.writeUInt32BE(input.txByteCount)

	const instructionCountAsData = Buffer.alloc(2)
	instructionCountAsData.writeUInt16BE(input.numberOfInstructions)

	const hrpLen =
		input.nonNativeTokenRriHRP === undefined
			? 0
			: input.nonNativeTokenRriHRP.length

	if (hrpLen > 255) {
		throw new Error(`Non native token HRP must not longer than 255.`)
	}
	const nonNativeTokenHrpLengthAsData = Buffer.alloc(1)
	nonNativeTokenHrpLengthAsData.writeUInt8(hrpLen)

	const nonNativeTokenHrpData =
		input.nonNativeTokenRriHRP === undefined
			? Buffer.alloc(0)
			: Buffer.from(input.nonNativeTokenRriHRP, 'utf8')

	const hrpData = Buffer.concat([
		nonNativeTokenHrpLengthAsData,
		nonNativeTokenHrpData,
	])

	const data = Buffer.concat([
		pathData,
		sizeOfTXAsData,
		instructionCountAsData,
		hrpData,
	])

	return makeAPDU({
		ins: LedgerInstruction.DO_SIGN_TX,
		p1,
		data,
	})
}

const signTxStream = (
	input: APDUDoSignTxSingleInstructionPackage,
): RadixAPDUT => {
	const p1 = SignTxAPDUType.SINGLE_RADIX_ENGINE_INSTRUCTION_APDU.valueOf()
	const p2 = input.isLastInstruction ? 0x01 : 0x00 // Not needed, Ledger device can keep a counter and compare vs 'numberOfInstructions' (P2 of 'FIRST_METADATA_APDU').
	return makeAPDU({
		ins: LedgerInstruction.DO_SIGN_TX,
		p1,
		p2,
		data: input.instructionBytes,
	})
}

const getAppName = (): RadixAPDUT =>
	makeAPDU({
		ins: LedgerInstruction.GET_APP_NAME,
	})
export const RadixAPDU = {
	getAppName,
	getVersion,
	getPublicKey,
	doKeyExchange,
	doSignHash,
	signTX: {
		initialSetup: signTxInitialSetupPackage,
		stream: signTxStream,
	},
}
