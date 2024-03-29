/**
 * Hyperloop Metabase Generator
 * Copyright (c) 2015 by Appcelerator, Inc.
 */
#ifndef HYPERLOOP_TYPEDEF_H
#define HYPERLOOP_TYPEDEF_H

#include "def.h"

namespace hyperloop {
	/**
	 * Typedef definition
	 */
	class TypeDefinition : public Definition {
	public:
		TypeDefinition (CXCursor cursor, const std::string &name, ParserContext *ctx);
		~TypeDefinition ();
		Json::Value toJSON () const;
		void setType(hyperloop::Type *type);
		Type* getType() { return type; }
	private:
		Type *type;
		CXChildVisitResult executeParse(CXCursor cursor, ParserContext *context);
	};
}

#endif
