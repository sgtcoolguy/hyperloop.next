/**
 * Hyperloop Library
 * Copyright (c) 2015 by Appcelerator, Inc.
 */
#import <objc/runtime.h>
#import <objc/message.h>
#import "define.h"
#import "class.h"
#import "utils.h"
#import "pointer.h"

@implementation HyperloopClass

@synthesize nativeObject = _nativeObject;

-(instancetype)initWithClassName: (NSString *)className alloc:(BOOL)alloc init:(SEL)init args:(NSArray*)args {
	if (self = [self init]) {
		Class c = NSClassFromString(className);
		if (c == nil) {
			@throw [NSException exceptionWithName:@"ClassNotFound" reason:[NSString stringWithFormat:@"Cannot find class with name: %@", className] userInfo:nil];
		}
		id instance = nil;
		BOOL isInstance = YES;
		if (alloc) {
			instance = [c alloc];
		} else {
			instance = c;
			isInstance = NO;
		}

		id nativeObject = [HyperloopUtils invokeSelector:init args:args target:instance instance:isInstance];
		id target = [nativeObject objectValue];
		if (!target) {
			target = [nativeObject classValue];
		}
		self.nativeObject = target;
	}
	REMEMBER(self);
	return self;
}

-(void)dealloc {
	[self destroy:nil];
	FORGET(self);
}

-(void)destroy:(id)args {
	RELEASE_AND_CHECK(self.nativeObject);
	RELEASE_AND_CHECK(self.customClass);
}

-(id)target {
	return self.nativeObject;
}

@end