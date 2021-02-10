import { Address, Signature } from '@radixdlt/crypto'
import { DSONCodable } from '@radixdlt/data-formats'
import { SpunParticleQueryable, SpunParticles } from './particles/_types'

/**
 * A Radix resource identifier is a human readable index into the Ledger which points to a name state machine
 *
 * On format: `/:address/:name`, e.g.
 * `"/JH1P8f3znbyrDj8F4RWpix7hRkgxqHjdW2fNnKpR3v6ufXnknor/XRD"`
 */
export type ResourceIdentifier = DSONCodable &
	Readonly<{
		address: Address
		name: string
		toString: () => string
		equals: (other: ResourceIdentifier) => boolean
	}>

/**
 * An Atom Identifier, made up of 256 bits of a hash.
 * The Atom ID is used so that Atoms can be located using just their hash id.
 */
export type AtomIdentifier = DSONCodable &
	Readonly<{
		toString: () => string
		equals: (other: AtomIdentifier) => boolean
	}>

export type IsOwnerOfToken = () => boolean

export enum TokenPermission {
	TOKEN_OWNER_ONLY = 'token_owner_only',
	ALL = 'all',
	NONE = 'none',
}

export enum TokenTransition {
	MINT = 'mint',
	BURN = 'burn',
}

export type TokenPermissions = DSONCodable &
	Readonly<{
		permissions: Readonly<{ [key in TokenTransition]: TokenPermission }>
		canBeMinted: (isOwnerOfToken: IsOwnerOfToken) => boolean
		canBeBurned: (isOwnerOfToken: IsOwnerOfToken) => boolean
		mintPermission: TokenPermission
		equals: (other: TokenPermissions) => boolean
	}>

export type ParticleGroup = DSONCodable &
	SpunParticleQueryable &
	Readonly<{
		spunParticles: SpunParticles
	}>

export type ParticleGroups = DSONCodable &
	SpunParticleQueryable &
	Readonly<{
		groups: ParticleGroup[]
	}>

// TODO change this when we have DSON encoding in place. Should be hash of dson truncated.
export type PublicKeyID = string

export type SignatureID = PublicKeyID
export type Signatures = Readonly<{ [key in SignatureID]: Signature }>

export type Atom = DSONCodable &
	SpunParticleQueryable &
	Readonly<{
		particleGroups: ParticleGroups // can be empty
		signatures: Signatures // can be empty
		message?: string
		identifier: () => AtomIdentifier
		isSigned: () => boolean
	}>