/**
 * Hyperloop Metabase Generator
 * Copyright (c) 2015 by Appcelerator, Inc.
 */
#ifndef HYPERLOOP_DEF_H
#define HYPERLOOP_DEF_H

#include <string>
#include <sstream>
#include <vector>
#include <map>
#include <set>

#include "clang-c/Index.h"
#include "json/json.h"


namespace hyperloop {

	class ParserContext;
	class ParserTree;

	class Serializable {
		public:
			Serializable ();
			virtual ~Serializable ();
			virtual Json::Value toJSON() const = 0;
	};

	class Type : public Serializable {
		public:
			Type (CXType type, ParserContext *ctx);
			Type (CXCursor cursor, ParserContext *ctx);
			Type (const Type &type);
			Type (Type &&type);
			Type (ParserContext *ctx, const std::string &type, const std::string &value = "", const std::string &encoding = "");
			virtual ~Type();
			virtual Json::Value toJSON() const;
			inline std::string getType() { return type; }
			inline std::string getValue() { return value; }
			inline std::string getEncoding() { return encoding; }

			void setType (const std::string &_type);
			void setValue (const std::string &_value);
			void swap(Type &other);
		private:
			ParserContext *context;
			std::string type;
			std::string value;
			std::string encoding;
	};

	class Argument : public Serializable {
		public:
			Argument(const std::string &name, Type *type);
			virtual ~Argument();
			virtual Json::Value toJSON() const;
			inline Type* getType () { return type; }
		private:
			std::string name;
			Type *type;
	};

	class Arguments : public Serializable {
		public:
			Arguments();
			virtual ~Arguments();
			void add(const std::string &name, Type *type);
			const Argument& get(size_t index);
			virtual Json::Value toJSON() const;
			inline size_t count() const { return arguments.size(); }
		private:
			std::vector<Argument *> arguments;
	};

	/**
	 * Abstract Base Class for a generation definition
	 */
	class Definition : public Serializable {
		public:
			Definition (CXCursor cursor, const std::string &name, ParserContext *ctx);
			virtual Json::Value toJSON () const = 0;
			CXChildVisitResult parse(CXCursor cursor, CXCursor parent, CXClientData clientData);
			void setName (const std::string &_name) { name = _name; }
			inline const std::string getName() const { return name; }
			inline const std::string getFileName() const { return filename; }
			inline const std::string getLine() const { return line; }
			inline const std::string getIntroducedIn() const { return introducedIn; }
			void setIntroducedIn(const CXVersion version);
			inline ParserContext* getContext() const { return context; }
			inline CXCursor getCursor() { return cursor; }
			std::string getFramework() const;

		protected:
			const CXCursor cursor;
			ParserContext *context;
			std::string name;
			std::string filename;
			std::string line;
			std::string introducedIn;

			virtual void toJSONBase (Json::Value &kv) const;

		private:
			virtual CXChildVisitResult executeParse (CXCursor cursor, ParserContext *context) = 0;

	};

}



#endif
